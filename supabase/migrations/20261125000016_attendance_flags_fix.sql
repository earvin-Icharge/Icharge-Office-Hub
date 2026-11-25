-- Fix: add flags with array_append (a bare string was read as an array literal).
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
  perform public.require(not (public.setting('selfie_required') #>> '{}')::boolean
                         or (v_selfie is not null and v_selfie like v_me::text || '/%'
                             and exists (select 1 from storage.objects o where o.bucket_id = 'selfies' and o.name = v_selfie)),
                         'A live selfie is needed to time in.');
  -- Offline time-ins keep the phone's time; it must be recent and not in the future.
  v_time := coalesce(v_device, now());
  perform public.require(v_time <= now() + interval '2 minutes' and v_time > now() - interval '3 days', 'The phone''s time is not valid.');
  v_day := (v_time at time zone 'Asia/Manila')::date;
  perform public.require(not exists (select 1 from public.attendance where profile_id = v_me and day = v_day), 'You already timed in today.');

  select * into v_pin from public.expected_pin(v_me, v_mode, v_site) limit 1;
  v_dist := public.distance_m(v_lat, v_lng, v_pin.lat, v_pin.lng);
  v_ok := v_dist is not null and v_dist <= coalesce(v_pin.radius, 200);
  if v_lat is null then v_flags := array_append(v_flags, 'no_gps'); end if;
  if v_dist is null and v_lat is not null then v_flags := array_append(v_flags, 'no_registered_pin'); end if;
  if v_dist is not null and not v_ok then v_flags := array_append(v_flags, 'outside_radius'); end if;
  if v_mode = 'field' and v_site is null then v_flags := array_append(v_flags, 'field_other'); v_ok := false; end if;
  if v_device is not null and now() - v_device > make_interval(mins => (public.setting('offline_gap_minutes') #>> '{}')::int) then v_flags := array_append(v_flags, 'sent_late'); end if;

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

