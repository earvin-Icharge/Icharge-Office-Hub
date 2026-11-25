-- Step 8: attendance with Office / WFH / Field modes, GPS check, live selfie, offline save-and-send (SPEC.md 5.2).

insert into public.app_settings (key, value) values
  ('office_pin', '{"name": "iCharge office", "lat": null, "lng": null}'),
  ('location_radius_m', '200'),
  ('selfie_required', 'true'),
  ('offline_gap_minutes', '30'),
  ('selfie_days', '90'),
  ('location_days', '365')
on conflict do nothing;

create table public.field_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business public.business not null default 'icharge',
  kiosk_id text,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 200,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  day date not null,
  mode text not null check (mode in ('office', 'wfh', 'field')),
  field_site_id uuid references public.field_sites (id),
  field_other_reason text,
  time_in timestamptz not null,
  time_out timestamptz,
  device_time_in timestamptz,
  received_at_in timestamptz not null default now(),
  device_time_out timestamptz,
  received_at_out timestamptz,
  sent_late boolean not null default false,
  late_minutes int not null default 0,
  undertime_minutes int not null default 0,
  in_distance_m int,
  out_distance_m int,
  location_ok boolean,
  out_location_ok boolean,
  employee_reason text,
  flags text[] not null default '{}',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  corrected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, day)
);
create index attendance_day_idx on public.attendance (day);
create trigger attendance_audit after insert or update or delete on public.attendance for each row execute function public.audit_row();

-- GPS points and selfie: employee (own), HR and Leader only; others' views are logged.
create table public.attendance_location (
  attendance_id uuid primary key references public.attendance (id) on delete cascade,
  in_lat double precision, in_lng double precision, in_accuracy_m int,
  out_lat double precision, out_lng double precision, out_accuracy_m int,
  selfie_path text,
  selfie_taken_at timestamptz
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 3145728, array['image/jpeg', 'image/webp', 'image/png']) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns int language sql immutable set search_path = '' as $$
  select case when lat1 is null or lat2 is null then null else
    round(6371000 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int end;
$$;

create or replace function public.my_shift(p_profile uuid)
returns public.shifts language sql stable security definer set search_path = '' as $$
  select s.* from public.shifts s
   where s.id = coalesce((select shift_id from public.hr_records where profile_id = p_profile), (select id from public.shifts order by created_at limit 1));
$$;

-- Where the person should be: (lat, lng, radius, label) for a mode / field site.
create or replace function public.expected_pin(p_profile uuid, p_mode text, p_site uuid)
returns table (lat double precision, lng double precision, radius int, label text)
language sql stable security definer set search_path = '' as $$
  select (public.setting('office_pin') ->> 'lat')::double precision, (public.setting('office_pin') ->> 'lng')::double precision,
         (public.setting('location_radius_m') #>> '{}')::int, coalesce(public.setting('office_pin') ->> 'name', 'Office') where p_mode = 'office'
  union all
  select h.wfh_lat, h.wfh_lng, (public.setting('location_radius_m') #>> '{}')::int, 'Home' from public.hr_private h where p_mode = 'wfh' and h.profile_id = p_profile
  union all
  select f.lat, f.lng, f.radius_m, f.name from public.field_sites f where p_mode = 'field' and f.id = p_site;
$$;

create or replace function public.can_see_attendance(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (p_profile = (select auth.uid()) or public.is_leader() or public.has_hr() or public.has_finance() or public.is_manager_of(p_profile));
$$;

-- ---------------------------------------------------------------------------
-- Time in / time out. Location is read only at these two moments (spec 5.2).
-- ---------------------------------------------------------------------------
create or replace function public.time_in(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_mode text := p ->> 'mode';
  v_site uuid := nullif(p ->> 'field_site_id', '')::uuid;
  v_other text := nullif(trim(coalesce(p ->> 'field_other_reason', '')), '');
  v_lat double precision := nullif(p ->> 'lat', '')::double precision;
  v_lng double precision := nullif(p ->> 'lng', '')::double precision;
  v_device timestamptz := nullif(p ->> 'device_time', '')::timestamptz;
  v_time timestamptz;
  v_day date;
  v_pin record;
  v_dist int;
  v_ok boolean;
  v_flags text[] := '{}';
  v_shift public.shifts;
  v_late int := 0;
  v_id uuid;
  v_selfie text := nullif(p ->> 'selfie_path', '');
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(v_mode in ('office', 'wfh', 'field'), 'Choose Office, WFH or Field.');
  perform public.require(v_mode = 'office' or (v_lat is not null and v_lng is not null), 'Turn on location to time in from home or the field.');
  perform public.require(v_mode <> 'field' or v_site is not null or v_other is not null, 'Choose the site, or Other with a reason.');
  perform public.require(not (public.setting('selfie_required') #>> '{}')::boolean or (v_selfie is not null and v_selfie like v_me::text || '/%'), 'A live selfie is needed to time in.');
  -- Offline time-ins keep the phone's time; it must be recent and not in the future.
  v_time := coalesce(v_device, now());
  perform public.require(v_time <= now() + interval '2 minutes' and v_time > now() - interval '3 days', 'The phone''s time is not valid.');
  v_day := (v_time at time zone 'Asia/Manila')::date;
  perform public.require(not exists (select 1 from public.attendance where profile_id = v_me and day = v_day), 'You already timed in today.');

  select * into v_pin from public.expected_pin(v_me, v_mode, v_site) limit 1;
  v_dist := public.distance_m(v_lat, v_lng, v_pin.lat, v_pin.lng);
  v_ok := v_dist is not null and v_dist <= coalesce(v_pin.radius, 200);
  if v_lat is null then v_flags := v_flags || 'no_gps'; end if;
  if v_dist is null and v_lat is not null then v_flags := v_flags || 'no_registered_pin'; end if;
  if v_dist is not null and not v_ok then v_flags := v_flags || 'outside_radius'; end if;
  if v_mode = 'field' and v_site is null then v_flags := v_flags || 'field_other'; v_ok := false; end if;
  if v_device is not null and now() - v_device > make_interval(mins => (public.setting('offline_gap_minutes') #>> '{}')::int) then v_flags := v_flags || 'sent_late'; end if;

  v_shift := public.my_shift(v_me);
  if v_shift.id is not null and extract(isodow from v_day)::int = any (v_shift.days) then
    v_late := greatest(0, (extract(epoch from (v_time at time zone 'Asia/Manila') - (v_day + v_shift.start_time)) / 60)::int - v_shift.grace_minutes);
  end if;

  insert into public.attendance (profile_id, day, mode, field_site_id, field_other_reason, time_in, device_time_in, received_at_in, sent_late,
                                 late_minutes, in_distance_m, location_ok, employee_reason, flags)
  values (v_me, v_day, v_mode, v_site, v_other, v_time, v_device, now(), 'sent_late' = any (v_flags), v_late, v_dist, v_ok,
          nullif(trim(coalesce(p ->> 'reason', '')), ''), v_flags)
  returning id into v_id;
  insert into public.attendance_location (attendance_id, in_lat, in_lng, in_accuracy_m, selfie_path, selfie_taken_at)
  values (v_id, v_lat, v_lng, nullif(p ->> 'accuracy', '')::numeric::int, v_selfie, v_time);
  return v_id;
end;
$$;

create or replace function public.time_out(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_lat double precision := nullif(p ->> 'lat', '')::double precision;
  v_lng double precision := nullif(p ->> 'lng', '')::double precision;
  v_device timestamptz := nullif(p ->> 'device_time', '')::timestamptz;
  v_time timestamptz := coalesce(nullif(p ->> 'device_time', '')::timestamptz, now());
  a public.attendance;
  v_pin record;
  v_dist int;
  v_shift public.shifts;
  v_under int := 0;
begin
  perform public.require(v_time <= now() + interval '2 minutes' and v_time > now() - interval '3 days', 'The phone''s time is not valid.');
  select * into a from public.attendance where profile_id = v_me and time_out is null and time_in <= v_time order by time_in desc limit 1 for update;
  perform public.require(found, 'You have not timed in.');
  select * into v_pin from public.expected_pin(v_me, a.mode, a.field_site_id) limit 1;
  v_dist := public.distance_m(v_lat, v_lng, v_pin.lat, v_pin.lng);
  v_shift := public.my_shift(v_me);
  if v_shift.id is not null and extract(isodow from a.day)::int = any (v_shift.days) then
    v_under := greatest(0, (extract(epoch from (a.day + v_shift.end_time) - (v_time at time zone 'Asia/Manila')) / 60)::int);
  end if;
  update public.attendance set time_out = v_time, device_time_out = v_device, received_at_out = now(), out_distance_m = v_dist,
         out_location_ok = v_dist is not null and v_dist <= coalesce(v_pin.radius, 200), undertime_minutes = v_under,
         flags = array_remove(flags, 'missing_time_out') ||
                 case when v_dist is not null and v_dist > coalesce(v_pin.radius, 200) and not ('outside_radius_out' = any (flags)) then array['outside_radius_out'] else '{}' end ||
                 case when v_device is not null and now() - v_device > make_interval(mins => (public.setting('offline_gap_minutes') #>> '{}')::int) and not ('sent_late' = any (flags)) then array['sent_late'] else '{}' end
   where id = a.id;
  update public.attendance_location set out_lat = v_lat, out_lng = v_lng, out_accuracy_m = nullif(p ->> 'accuracy', '')::numeric::int where attendance_id = a.id;
end;
$$;

-- GPS points and selfie path for HR / Leader (logged) or the employee (own).
create or replace function public.get_attendance_location(p_attendance uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.attendance; l public.attendance_location;
begin
  select * into a from public.attendance where id = p_attendance;
  perform public.require(found and (a.profile_id = (select auth.uid()) or public.is_leader() or public.has_hr()), 'Not allowed.');
  select * into l from public.attendance_location where attendance_id = p_attendance;
  perform public.log_sensitive_view(a.profile_id, 'attendance_location');
  return to_jsonb(l);
end;
$$;

-- HR reviews flags; HR corrects only with a reason (audit log keeps old -> new). HR's own record: Leader.
create or replace function public.review_attendance(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.attendance;
begin
  select * into a from public.attendance where id = p_id;
  perform public.require(found and public.can_edit_hr(a.profile_id), 'Only HR (or a Leader for HR''s own record) can review.');
  update public.attendance set reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
end;
$$;

create or replace function public.correct_attendance(p_id uuid, p jsonb, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.attendance;
begin
  select * into a from public.attendance where id = p_id for update;
  perform public.require(found and public.can_edit_hr(a.profile_id), 'Only HR (or a Leader for HR''s own record) can correct attendance.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason for the correction.');
  update public.attendance set
    time_in = coalesce(nullif(p ->> 'time_in', '')::timestamptz, time_in),
    time_out = case when p ? 'time_out' then nullif(p ->> 'time_out', '')::timestamptz else time_out end,
    late_minutes = coalesce(nullif(p ->> 'late_minutes', '')::int, late_minutes),
    undertime_minutes = coalesce(nullif(p ->> 'undertime_minutes', '')::int, undertime_minutes),
    corrected = true, review_note = trim(p_reason), reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_id;
end;
$$;

create or replace function public.save_field_site(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader() or public.heads_department('ops'), 'Only HR or the Ops head can edit field sites.');
  if p_id is null then
    insert into public.field_sites (name, business, kiosk_id, lat, lng, radius_m)
    values (trim(p ->> 'name'), coalesce(nullif(p ->> 'business', ''), 'icharge')::public.business, nullif(upper(trim(coalesce(p ->> 'kiosk_id', ''))), ''),
            (p ->> 'lat')::double precision, (p ->> 'lng')::double precision, coalesce(nullif(p ->> 'radius_m', '')::int, 200));
  else
    update public.field_sites set name = trim(p ->> 'name'), business = coalesce(nullif(p ->> 'business', ''), 'icharge')::public.business,
           kiosk_id = nullif(upper(trim(coalesce(p ->> 'kiosk_id', ''))), ''), lat = (p ->> 'lat')::double precision, lng = (p ->> 'lng')::double precision,
           radius_m = coalesce(nullif(p ->> 'radius_m', '')::int, 200), active = coalesce((p ->> 'active')::boolean, true) where id = p_id;
  end if;
end;
$$;

create or replace function public.save_office_pin(p_name text, p_lat double precision, p_lng double precision, p_radius int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader() or public.has_hr(), 'Only a Leader or HR can set the office pin.');
  update public.app_settings set value = jsonb_build_object('name', p_name, 'lat', p_lat, 'lng', p_lng), updated_by = (select auth.uid()), updated_at = now() where key = 'office_pin';
  update public.app_settings set value = to_jsonb(p_radius), updated_by = (select auth.uid()), updated_at = now() where key = 'location_radius_m';
end;
$$;

-- Missing time-out: flagged for the employee and HR at 11 pm (spec 5.2). Never marks AWOL.
create or replace function public.run_attendance_checks()
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  for a in select * from public.attendance where time_out is null and day < public.manila_now()::date + 1 and public.manila_now()::time >= time '23:00'
             and not ('missing_time_out' = any (flags)) loop
    update public.attendance set flags = flags || 'missing_time_out' where id = a.id;
    perform public.notify(a.profile_id, 'missing_time_out', 'You did not time out on ' || to_char(a.day, 'DD Mon'), 'HR will review it. Add a note in Attendance if needed.', '/hr/attendance', 'attendance', a.id);
  end loop;
end;
$$;
select cron.schedule('oh-attendance-checks', '*/30 15-16 * * *', 'select public.run_attendance_checks();');

-- Selfies after 90 days and GPS points after 1 year are deleted (spec 5.2, 10): the app removes the files.
create or replace function public.call_app_retention()
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret text; v_url text;
begin
  select value into v_secret from public.app_secrets where key = 'cron_secret';
  v_url := public.setting('app_url') #>> '{}';
  if v_secret is null then return; end if;
  update public.attendance_location set in_lat = null, in_lng = null, out_lat = null, out_lng = null, in_accuracy_m = null, out_accuracy_m = null
   where attendance_id in (select id from public.attendance where time_in < now() - make_interval(days => (public.setting('location_days') #>> '{}')::int)) and in_lat is not null;
  perform net.http_post(url := v_url || '/api/cron/retention', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), body := '{}'::jsonb);
end;
$$;
select cron.schedule('oh-retention', '41 18 * * *', 'select public.call_app_retention();');

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.field_sites enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_location enable row level security;
create policy "field_sites: read" on public.field_sites for select to authenticated using (public.is_active_user());
create policy "attendance: visible" on public.attendance for select to authenticated using (public.can_see_attendance(profile_id));
create policy "attendance_location: own" on public.attendance_location for select to authenticated
  using (exists (select 1 from public.attendance a where a.id = attendance_id and a.profile_id = (select auth.uid())));
grant select on public.field_sites, public.attendance, public.attendance_location to authenticated;
grant all on public.field_sites, public.attendance, public.attendance_location to service_role;

do $$
declare f text;
begin
  foreach f in array array['time_in(jsonb)', 'time_out(jsonb)', 'get_attendance_location(uuid)', 'review_attendance(uuid, text)', 'correct_attendance(uuid, jsonb, text)',
    'save_field_site(uuid, jsonb)', 'save_office_pin(text, double precision, double precision, integer)', 'can_see_attendance(uuid)', 'distance_m(double precision, double precision, double precision, double precision)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_attendance_checks() from public, anon, authenticated;
revoke execute on function public.call_app_retention() from public, anon, authenticated;
revoke execute on function public.expected_pin(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.my_shift(uuid) from public, anon, authenticated;
