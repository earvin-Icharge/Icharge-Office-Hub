-- Step 9: leave and holidays, linked to task assignment (SPEC.md 3.4, 5.3).

insert into public.app_settings (key, value) values ('ceo_profile_id', 'null') on conflict do nothing;

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  yearly_days numeric(5, 1) not null default 0,
  paid boolean not null default true,
  active boolean not null default true,
  position int not null default 0
);
insert into public.leave_types (code, name, yearly_days, position) values
  ('vacation', 'Vacation', 10, 1), ('sick', 'Sick', 10, 2), ('emergency', 'Emergency', 3, 3), ('sil', 'Service Incentive Leave', 5, 4),
  ('maternity', 'Maternity', 105, 5), ('paternity', 'Paternity', 7, 6), ('solo_parent', 'Solo Parent', 7, 7);

create table public.leave_balances (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type_id uuid not null references public.leave_types (id),
  year int not null,
  entitled numeric(5, 1) not null,
  adjustment numeric(5, 1) not null default 0,
  note text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (profile_id, type_id, year)
);
create trigger leave_balances_audit after insert or update or delete on public.leave_balances for each row execute function public.audit_row();

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  half_day boolean not null default false,
  days numeric(5, 1) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  approver_id uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now()
);
create index leave_requests_dates_idx on public.leave_requests (profile_id, start_date, end_date) where status = 'approved';
create trigger leave_requests_audit after insert or update or delete on public.leave_requests for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.leave_days(p_start date, p_end date, p_half boolean)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when p_half and p_start = p_end then 0.5 else (select count(*) from generate_series(p_start, p_end, interval '1 day') d where public.is_working_day(d::date)) end;
$$;

create or replace function public.on_leave(p_profile uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leave_requests where profile_id = p_profile and status = 'approved' and p_day between start_date and end_date);
$$;

-- Who approves (spec 3.4): Staff -> their Manager (or the Manager's backup / a Leader if the Manager is on leave);
-- Managers and HR users -> a Leader; a Leader -> another Leader; the CEO's own leave needs no approval.
create or replace function public.leave_approver(p_profile uuid, p_start date)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.profiles;
  v_mgr uuid;
  v_leader uuid;
begin
  select * into p from public.profiles where id = p_profile;
  select id into v_leader from public.profiles where active and access_level = 'leader' and id <> p_profile
   order by (id = nullif(public.setting('ceo_profile_id') #>> '{}', '')::uuid) desc, created_at limit 1;
  if p.access_level = 'leader' then
    return case when p_profile = nullif(public.setting('ceo_profile_id') #>> '{}', '')::uuid then null else v_leader end;
  end if;
  if p.access_level = 'manager' or p.hr_access then return v_leader; end if;
  select id into v_mgr from public.profiles where id = p.supervisor_id and active and access_level in ('manager', 'leader');
  if v_mgr is null then
    select d.head_id into v_mgr from public.departments d join public.profiles h on h.id = d.head_id where d.id = p.department_id and h.active and d.head_id <> p_profile;
  end if;
  if v_mgr is null then return v_leader; end if;
  if public.on_leave(v_mgr, greatest(p_start, public.manila_now()::date)) or public.on_leave(v_mgr, public.manila_now()::date) then
    select * into m from public.profiles where id = v_mgr;
    return coalesce((select id from public.profiles where id = m.backup_approver_id and active), v_leader);
  end if;
  return v_mgr;
end;
$$;

create or replace function public.can_see_leave(p_profile uuid, p_approver uuid, p_status text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    p_profile = (select auth.uid()) or p_approver = (select auth.uid()) or public.is_leader() or public.has_hr() or public.is_manager_of(p_profile)
    or (public.has_finance() and p_status = 'approved'));
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
create or replace function public.file_leave(p_type uuid, p_start date, p_end date, p_half boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_days numeric;
  v_approver uuid;
  v_id uuid;
  v_name text;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(p_end >= p_start, 'The end date is before the start date.');
  perform public.require(not exists (select 1 from public.leave_requests where profile_id = v_me and status in ('pending', 'approved')
                                     and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')), 'You already have leave on some of these days.');
  v_days := public.leave_days(p_start, p_end, coalesce(p_half, false));
  perform public.require(v_days > 0, 'These dates are all non-working days.');
  v_approver := public.leave_approver(v_me, p_start);
  select name into v_name from public.profiles where id = v_me;
  insert into public.leave_requests (profile_id, type_id, start_date, end_date, half_day, days, reason, approver_id, status, decided_at)
  values (v_me, p_type, p_start, p_end, coalesce(p_half, false), v_days, nullif(trim(coalesce(p_reason, '')), ''), v_approver,
          case when v_approver is null then 'approved' else 'pending' end, case when v_approver is null then now() end)
  returning id into v_id;
  if v_approver is not null then
    perform public.notify(v_approver, 'leave_request', 'Leave request: ' || v_name,
      to_char(p_start, 'DD Mon') || case when p_end <> p_start then ' – ' || to_char(p_end, 'DD Mon') else '' end || ' (' || v_days || ' days)', '/hr/leave', 'leave', v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  v_me uuid := (select auth.uid());
  v_tasks int;
  h uuid;
begin
  select * into r from public.leave_requests where id = p_id for update;
  perform public.require(found and r.status = 'pending', 'This request is not waiting for a decision.');
  perform public.require(r.profile_id <> v_me, 'You cannot approve your own leave.');
  perform public.require(r.approver_id = v_me or public.is_leader()
    or exists (select 1 from public.profiles a where a.id = r.approver_id and a.backup_approver_id = v_me and public.on_leave(a.id, public.manila_now()::date)),
    'This request is for someone else to approve.');
  -- HR users' leave is handled by a Leader (conflict of interest).
  perform public.require(not exists (select 1 from public.profiles where id = r.profile_id and (hr_access or access_level = 'manager')) or public.is_leader(),
    'Managers'' and HR users'' leave is approved by a Leader.');
  perform public.require(p_approve or length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason for declining.');
  update public.leave_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = v_me, decided_at = now(),
         decline_reason = case when p_approve then null else trim(p_reason) end where id = p_id;
  perform public.notify(r.profile_id, 'leave_decided', case when p_approve then 'Leave approved' else 'Leave declined' end,
    to_char(r.start_date, 'DD Mon') || case when r.end_date <> r.start_date then ' – ' || to_char(r.end_date, 'DD Mon') else '' end, '/hr/leave', 'leave', p_id);
  if p_approve then
    select count(*) into v_tasks from public.tasks where owner_id = r.profile_id and deleted_at is null and status in ('todo', 'in_progress', 'waiting')
      and (due_at at time zone 'Asia/Manila')::date between r.start_date and r.end_date;
    if v_tasks > 0 then
      for h in select r.profile_id union select public.heads_of(r.profile_id) loop
        perform public.notify(h, 'leave_tasks', v_tasks || ' tasks are due during approved leave', 'Consider reassigning them.', '/hr/leave?req=' || p_id, 'leave', p_id);
      end loop;
    end if;
  end if;
end;
$$;

create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leave_requests set status = 'cancelled' where id = p_id and profile_id = (select auth.uid()) and status = 'pending';
  perform public.require(found, 'Only your own pending request can be cancelled.');
end;
$$;

-- Balances: HR edits; an HR user's own balance is edited by a Leader.
create or replace function public.set_leave_balance(p_profile uuid, p_type uuid, p_year int, p_entitled numeric, p_adjustment numeric, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR (or a Leader for HR''s own balance) can edit balances.');
  insert into public.leave_balances (profile_id, type_id, year, entitled, adjustment, note, updated_by)
  values (p_profile, p_type, p_year, p_entitled, coalesce(p_adjustment, 0), nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()))
  on conflict (profile_id, type_id, year) do update set entitled = excluded.entitled, adjustment = excluded.adjustment, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Balance per type for a person and year: entitled (default from the type), used (approved), pending.
create or replace function public.leave_summary(p_profile uuid, p_year int)
returns table (type_id uuid, code text, name text, entitled numeric, adjustment numeric, used numeric, pending numeric, available numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require(p_profile = (select auth.uid()) or public.is_leader() or public.has_hr() or public.has_finance() or public.is_manager_of(p_profile), 'Not allowed.');
  return query
    select t.id, t.code, t.name, coalesce(b.entitled, t.yearly_days), coalesce(b.adjustment, 0),
           coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p_profile and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = p_year), 0),
           coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p_profile and r.type_id = t.id and r.status = 'pending' and extract(year from r.start_date) = p_year), 0),
           coalesce(b.entitled, t.yearly_days) + coalesce(b.adjustment, 0)
             - coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p_profile and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = p_year), 0)
      from public.leave_types t left join public.leave_balances b on b.type_id = t.id and b.profile_id = p_profile and b.year = p_year
     where t.active order by t.position;
end;
$$;

-- Assigning a task due during someone's approved leave shows a warning (spec 5.3).
create or replace function public.leave_conflict(p_owner uuid, p_due timestamptz)
returns text language sql stable security definer set search_path = '' as $$
  select p.name || ' is on approved leave ' || to_char(r.start_date, 'DD Mon') || case when r.end_date <> r.start_date then '–' || to_char(r.end_date, 'DD Mon') else '' end
    from public.leave_requests r join public.profiles p on p.id = r.profile_id
   where r.profile_id = p_owner and r.status = 'approved' and (p_due at time zone 'Asia/Manila')::date between r.start_date and r.end_date limit 1;
$$;

create or replace function public.save_leave_type(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR can edit leave types.');
  if p_id is null then
    insert into public.leave_types (code, name, yearly_days, paid, position)
    values (lower(regexp_replace(trim(p ->> 'name'), '\W+', '_', 'g')), trim(p ->> 'name'), (p ->> 'yearly_days')::numeric, coalesce((p ->> 'paid')::boolean, true), 99);
  else
    update public.leave_types set name = trim(p ->> 'name'), yearly_days = (p ->> 'yearly_days')::numeric, paid = coalesce((p ->> 'paid')::boolean, true),
           active = coalesce((p ->> 'active')::boolean, true) where id = p_id;
  end if;
end;
$$;

create or replace function public.save_holiday(p_day date, p_name text, p_kind text, p_delete boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR can edit holidays.');
  if p_delete then delete from public.holidays where day = p_day; return; end if;
  insert into public.holidays (day, name, kind, created_by) values (p_day, trim(p_name), p_kind, (select auth.uid()))
  on conflict (day) do update set name = excluded.name, kind = excluded.kind;
end;
$$;

-- Daily digest: also counts leave requests waiting for the person.
create or replace function public.run_daily_digest()
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_today date := public.manila_now()::date;
  n_today int; n_over int; n_appr int;
  parts text[];
begin
  if public.manila_now()::time < (public.setting('digest_time') #>> '{}')::time then return; end if;
  for p in select * from public.profiles where active loop
    if not public.once(p.id, 'digest', v_today::text) then continue; end if;
    select count(*) filter (where (due_at at time zone 'Asia/Manila')::date = v_today), count(*) filter (where due_at < now())
      into n_today, n_over
      from public.tasks where owner_id = p.id and deleted_at is null and assign_state = 'accepted' and status in ('todo', 'in_progress', 'waiting');
    select (select count(*) from public.tasks where assigned_by = p.id and approval_state = 'pending' and status = 'done' and deleted_at is null)
         + (select count(*) from public.tasks t where t.assign_state = 'requested' and t.deleted_at is null and p.id in (select public.heads_of(t.owner_id)))
         + (select count(*) from public.leave_requests where approver_id = p.id and status = 'pending')
         + case when p.access_level = 'leader' then (select count(*) from public.access_requests where status = 'proposed')
                                                   + (select count(*) from public.invites where status = 'proposed')
                                                   + (select count(*) from public.access_changes where status = 'proposed') else 0 end
         + case when p.hr_access then (select count(*) from public.access_requests where status in ('pending', 'sent_back')) else 0 end
      into n_appr;
    if n_today + n_over + n_appr = 0 then continue; end if;
    parts := array_remove(array[
      case when n_today > 0 then n_today || ' due today' end,
      case when n_over > 0 then n_over || ' overdue' end,
      case when n_appr > 0 then n_appr || ' waiting for your approval' end], null);
    insert into public.notifications (profile_id, kind, title, body, url)
    values (p.id, 'digest', 'Your day: ' || array_to_string(parts, ', '), 'Open My day for the details.', '/today');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
create policy "leave_types: read" on public.leave_types for select to authenticated using (public.is_active_user());
create policy "leave_balances: visible" on public.leave_balances for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_leader() or public.has_hr() or public.has_finance() or public.is_manager_of(profile_id));
create policy "leave_requests: visible" on public.leave_requests for select to authenticated using (public.can_see_leave(profile_id, approver_id, status));
grant select on public.leave_types, public.leave_balances, public.leave_requests to authenticated;
grant all on public.leave_types, public.leave_balances, public.leave_requests to service_role;

do $$
declare f text;
begin
  foreach f in array array['file_leave(uuid, date, date, boolean, text)', 'decide_leave(uuid, boolean, text)', 'cancel_leave(uuid)',
    'set_leave_balance(uuid, uuid, integer, numeric, numeric, text)', 'leave_summary(uuid, integer)', 'leave_conflict(uuid, timestamptz)',
    'save_leave_type(uuid, jsonb)', 'save_holiday(date, text, text, boolean)', 'leave_days(date, date, boolean)', 'on_leave(uuid, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.leave_approver(uuid, date) from public, anon, authenticated;
