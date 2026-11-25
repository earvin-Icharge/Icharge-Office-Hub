-- Step 1b: access requests, invites, access changes, deactivation (SPEC.md 3.4, 3.5).
-- Every rule lives here, in SECURITY DEFINER functions, so the database is the real guard:
--   * HR proposes, the Leader approves (a Leader may propose and approve in one step).
--   * Nobody changes their own access or approves their own request/proposal.
--   * Removing access is immediate; only a Leader can deactivate a Leader.
-- The tables have no insert/update/delete grants for signed-in users: only these functions write.

create type public.request_status as enum ('pending', 'proposed', 'approved', 'declined', 'sent_back');
create type public.invite_status as enum ('proposed', 'approved', 'declined', 'used', 'cancelled');
create type public.change_status as enum ('proposed', 'approved', 'declined');

alter table public.profiles add column access_changed_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  department_id uuid references public.departments (id),
  position text not null check (length(trim(position)) between 2 and 120),
  supervisor_id uuid references public.profiles (id),
  mobile text not null check (length(trim(mobile)) between 7 and 30),
  status public.request_status not null default 'pending',
  proposed_level public.access_level,
  proposed_hr boolean,
  proposed_finance boolean,
  proposed_department_id uuid references public.departments (id),
  proposed_by uuid references public.profiles (id),
  proposed_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  decline_reason text,
  sent_back_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open request per person.
create unique index access_requests_one_open on public.access_requests (user_id)
  where status in ('pending', 'proposed', 'sent_back');

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  full_name text not null,
  position text,
  department_id uuid references public.departments (id),
  supervisor_id uuid references public.profiles (id),
  access_level public.access_level not null default 'staff',
  hr_access boolean not null default false,
  finance_access boolean not null default false,
  status public.invite_status not null default 'proposed',
  invited_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create unique index invites_one_open on public.invites (email) where status in ('proposed', 'approved');

create table public.access_changes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  old_level public.access_level not null,
  old_hr boolean not null,
  old_finance boolean not null,
  new_level public.access_level not null,
  new_hr boolean not null,
  new_finance boolean not null,
  reason text not null,
  status public.change_status not null default 'proposed',
  proposed_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  decline_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index access_changes_one_open on public.access_changes (profile_id) where status = 'proposed';

create trigger access_requests_audit after insert or update or delete on public.access_requests
  for each row execute function public.audit_row();
create trigger invites_audit after insert or update or delete on public.invites
  for each row execute function public.audit_row();
create trigger access_changes_audit after insert or update or delete on public.access_changes
  for each row execute function public.audit_row();
create trigger access_requests_touch before update on public.access_requests
  for each row execute function public.touch_updated_at();

-- Audit: requests and invites name the person concerned.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_id text := v_row ->> 'id';
  v_subject uuid;
begin
  v_subject := case tg_table_name
    when 'profiles' then (v_row ->> 'id')::uuid
    when 'access_changes' then (v_row ->> 'profile_id')::uuid
    when 'access_requests' then (v_row ->> 'user_id')::uuid
    else null end;
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, old, new)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_subject, v_old, v_new);
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: read only. Writes go through the functions below.
-- ---------------------------------------------------------------------------
alter table public.access_requests enable row level security;
alter table public.invites enable row level security;
alter table public.access_changes enable row level security;

create policy "requests: own" on public.access_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "requests: hr and leader" on public.access_requests
  for select to authenticated using (public.has_hr() or public.is_leader());
create policy "invites: hr and leader" on public.invites
  for select to authenticated using (public.has_hr() or public.is_leader());
create policy "changes: hr and leader" on public.access_changes
  for select to authenticated using (public.has_hr() or public.is_leader());
create policy "changes: own" on public.access_changes
  for select to authenticated using (profile_id = (select auth.uid()));

grant select on public.access_requests, public.invites, public.access_changes to authenticated;
grant all on public.access_requests, public.invites, public.access_changes to service_role;

-- The audit log: HR also sees access requests, invites and access changes.
drop policy "audit: hr read hr changes" on public.audit_log;
create policy "audit: hr read hr changes" on public.audit_log
  for select to authenticated using (
    public.has_hr() and table_name in (
      'profiles', 'access_requests', 'invites', 'access_changes',
      'hr_records', 'hr_private', 'documents', 'attendance',
      'leave_requests', 'leave_balances', 'disciplinary_cases'
    )
  );

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid());
$$;

create or replace function public.has_profile()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()));
$$;

create or replace function public.require(ok boolean, msg text)
returns void language plpgsql set search_path = '' as $$
begin
  if not coalesce(ok, false) then
    raise exception '%', msg using errcode = '42501';
  end if;
end;
$$;

create or replace function public.next_employee_id()
returns text language sql volatile security definer set search_path = '' as $$
  select 'IC-' || lpad((coalesce(max(nullif(regexp_replace(employee_id, '\D', '', 'g'), '')::int), 0) + 1)::text, 4, '0')
  from public.profiles where employee_id like 'IC-%';
$$;

-- ---------------------------------------------------------------------------
-- New employee: form options, request, invite claim
-- ---------------------------------------------------------------------------

-- Departments and possible supervisors, for the /welcome form (the person has no access yet).
create or replace function public.welcome_options()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
                             from public.departments d), '[]'::jsonb),
    'supervisors', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'position', p.position) order by p.name)
                             from public.profiles p where p.active and p.access_level in ('leader', 'manager')), '[]'::jsonb)
  ) end;
$$;

create or replace function public.submit_access_request(
  p_full_name text, p_department_id uuid, p_position text, p_supervisor_id uuid, p_mobile text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := public.my_email();
  v_id uuid;
begin
  perform public.require(v_uid is not null, 'Not signed in.');
  perform public.require(not public.has_profile(), 'You already have an employee record.');
  perform public.require(exists (select 1 from public.allowed_email_domains d where d.domain = split_part(v_email, '@', 2)),
                         'Use your iCharge work email.');
  perform public.require(not exists (select 1 from public.access_requests r
                                     where r.user_id = v_uid and r.status in ('pending', 'proposed', 'sent_back')),
                         'You already have a request waiting.');
  insert into public.access_requests (user_id, email, full_name, department_id, position, supervisor_id, mobile)
  values (v_uid, v_email, trim(p_full_name), p_department_id, trim(p_position), p_supervisor_id, trim(p_mobile))
  returning id into v_id;
  return v_id;
end;
$$;

-- An invited person gets access right after their first code (spec 3.5).
create or replace function public.claim_invite()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := public.my_email();
  v_inv public.invites;
begin
  if v_uid is null or public.has_profile() then return false; end if;
  select * into v_inv from public.invites i where i.email = v_email and i.status = 'approved' limit 1;
  if not found then return false; end if;
  insert into public.profiles (id, employee_id, name, email, department_id, position, supervisor_id,
                               access_level, hr_access, finance_access)
  values (v_uid, public.next_employee_id(), v_inv.full_name, v_email, v_inv.department_id, v_inv.position,
          v_inv.supervisor_id, v_inv.access_level, v_inv.hr_access, v_inv.finance_access);
  update public.invites set status = 'used', used_at = now() where id = v_inv.id;
  update public.access_requests set status = 'declined', decline_reason = 'Joined through an invite.'
   where user_id = v_uid and status in ('pending', 'proposed', 'sent_back');
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access requests: HR proposes, Leader approves / sends back; HR or Leader declines
-- ---------------------------------------------------------------------------
create or replace function public.propose_access_request(
  p_request_id uuid, p_level public.access_level, p_hr boolean, p_finance boolean, p_department_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.access_requests;
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR or a Leader can propose access.');
  select * into v_req from public.access_requests where id = p_request_id for update;
  perform public.require(found, 'Request not found.');
  perform public.require(v_req.user_id <> (select auth.uid()), 'You cannot handle your own request.');
  perform public.require(v_req.status in ('pending', 'sent_back'), 'This request is not waiting for a proposal.');
  update public.access_requests
     set status = 'proposed', proposed_level = p_level, proposed_hr = p_hr, proposed_finance = p_finance,
         proposed_department_id = coalesce(p_department_id, v_req.department_id),
         proposed_by = (select auth.uid()), proposed_at = now(), sent_back_reason = null
   where id = p_request_id;
end;
$$;

-- The Leader approves (and may change) the proposal, or handles the request directly.
create or replace function public.approve_access_request(
  p_request_id uuid, p_level public.access_level, p_hr boolean, p_finance boolean, p_department_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_req public.access_requests;
begin
  perform public.require(public.is_leader(), 'Only a Leader can approve access.');
  select * into v_req from public.access_requests where id = p_request_id for update;
  perform public.require(found, 'Request not found.');
  perform public.require(v_req.user_id <> v_me, 'You cannot approve your own request.');
  perform public.require(v_req.status in ('pending', 'proposed', 'sent_back'), 'This request is already closed.');
  perform public.require(not exists (select 1 from public.profiles where id = v_req.user_id), 'This person already has a record.');

  insert into public.profiles (id, employee_id, name, email, phone, department_id, position, supervisor_id,
                               access_level, hr_access, finance_access)
  values (v_req.user_id, public.next_employee_id(), v_req.full_name, v_req.email, v_req.mobile,
          coalesce(p_department_id, v_req.proposed_department_id, v_req.department_id), v_req.position,
          v_req.supervisor_id, p_level, p_hr, p_finance);

  update public.access_requests
     set status = 'approved', approved_by = v_me, approved_at = now(),
         proposed_level = coalesce(proposed_level, p_level),
         proposed_hr = coalesce(proposed_hr, p_hr),
         proposed_finance = coalesce(proposed_finance, p_finance),
         proposed_by = coalesce(proposed_by, v_me), proposed_at = coalesce(proposed_at, now())
   where id = p_request_id;
end;
$$;

create or replace function public.send_back_access_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader can send a proposal back.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason.');
  update public.access_requests set status = 'sent_back', sent_back_reason = trim(p_reason)
   where id = p_request_id and status = 'proposed' and user_id <> (select auth.uid());
  perform public.require(found, 'Only a proposed request can be sent back.');
end;
$$;

create or replace function public.decline_access_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR or a Leader can decline.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason.');
  update public.access_requests set status = 'declined', decline_reason = trim(p_reason)
   where id = p_request_id and status in ('pending', 'proposed', 'sent_back') and user_id <> (select auth.uid());
  perform public.require(found, 'This request is already closed.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites: HR proposes, the Leader approves. A Leader's own invite is approved at once.
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(
  p_email text, p_full_name text, p_position text, p_department_id uuid, p_supervisor_id uuid,
  p_level public.access_level, p_hr boolean, p_finance boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_leader boolean := public.is_leader();
  v_id uuid;
begin
  perform public.require(public.has_hr() or v_leader, 'Only HR or a Leader can invite.');
  perform public.require(v_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$', 'Type a full email address.');
  perform public.require(exists (select 1 from public.allowed_email_domains d where d.domain = split_part(v_email, '@', 2)),
                         'Use an iCharge work email.');
  perform public.require(not exists (select 1 from public.profiles p where p.email = v_email), 'This person already has a record.');
  perform public.require(v_email <> public.my_email(), 'You cannot invite yourself.');
  insert into public.invites (email, full_name, position, department_id, supervisor_id, access_level, hr_access, finance_access,
                              status, invited_by, approved_by, approved_at)
  values (v_email, trim(p_full_name), nullif(trim(coalesce(p_position, '')), ''), p_department_id, p_supervisor_id,
          p_level, p_hr, p_finance,
          case when v_leader then 'approved' else 'proposed' end::public.invite_status,
          v_me, case when v_leader then v_me end, case when v_leader then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.decide_invite(p_invite_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  select * into v_inv from public.invites where id = p_invite_id for update;
  perform public.require(found, 'Invite not found.');
  if p_approve then
    perform public.require(public.is_leader(), 'Only a Leader can approve an invite.');
    perform public.require(v_inv.status = 'proposed', 'This invite is not waiting for approval.');
    perform public.require(v_inv.invited_by <> (select auth.uid()), 'You cannot approve your own proposal.');
    update public.invites set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p_invite_id;
  else
    perform public.require(public.has_hr() or public.is_leader(), 'Only HR or a Leader can cancel an invite.');
    perform public.require(v_inv.status in ('proposed', 'approved'), 'This invite is already closed.');
    update public.invites
       set status = case when v_inv.status = 'proposed' and public.is_leader() then 'declined' else 'cancelled' end::public.invite_status,
           decline_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_invite_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access changes for existing employees
-- ---------------------------------------------------------------------------
create or replace function public.apply_access(
  p_profile_id uuid, p_level public.access_level, p_hr boolean, p_finance boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles
     set access_level = p_level, hr_access = p_hr, finance_access = p_finance, access_changed_at = now()
   where id = p_profile_id;
$$;
revoke execute on function public.apply_access(uuid, public.access_level, boolean, boolean) from public, anon, authenticated;

create or replace function public.propose_access_change(
  p_profile_id uuid, p_level public.access_level, p_hr boolean, p_finance boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_leader boolean := public.is_leader();
  v_p public.profiles;
  v_id uuid;
begin
  perform public.require(public.has_hr() or v_leader, 'Only HR or a Leader can change access.');
  perform public.require(p_profile_id <> v_me, 'You cannot change your own access.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason.');
  select * into v_p from public.profiles where id = p_profile_id;
  perform public.require(found, 'Employee not found.');
  perform public.require(v_p.access_level <> p_level or v_p.hr_access <> p_hr or v_p.finance_access <> p_finance, 'Nothing would change.');
  perform public.require(not exists (select 1 from public.access_changes c where c.profile_id = p_profile_id and c.status = 'proposed'),
                         'A change for this person is already waiting.');
  insert into public.access_changes (profile_id, old_level, old_hr, old_finance, new_level, new_hr, new_finance, reason,
                                     status, proposed_by, approved_by, decided_at)
  values (p_profile_id, v_p.access_level, v_p.hr_access, v_p.finance_access, p_level, p_hr, p_finance, trim(p_reason),
          case when v_leader then 'approved' else 'proposed' end::public.change_status,
          v_me, case when v_leader then v_me end, case when v_leader then now() end)
  returning id into v_id;
  if v_leader then
    perform public.apply_access(p_profile_id, p_level, p_hr, p_finance);
  end if;
  return v_id;
end;
$$;

create or replace function public.decide_access_change(p_change_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_c public.access_changes;
begin
  select * into v_c from public.access_changes where id = p_change_id for update;
  perform public.require(found, 'Change not found.');
  perform public.require(v_c.status = 'proposed', 'This change is already decided.');
  if p_approve then
    perform public.require(public.is_leader(), 'Only a Leader can approve an access change.');
    perform public.require(v_c.proposed_by <> v_me and v_c.profile_id <> v_me, 'You cannot approve your own proposal or your own access.');
    update public.access_changes set status = 'approved', approved_by = v_me, decided_at = now() where id = p_change_id;
    perform public.apply_access(v_c.profile_id, v_c.new_level, v_c.new_hr, v_c.new_finance);
  else
    perform public.require(public.is_leader() or (public.has_hr() and v_c.proposed_by = v_me), 'Only a Leader, or the HR user who proposed it, can withdraw this.');
    update public.access_changes set status = 'declined', approved_by = v_me, decided_at = now(),
           decline_reason = nullif(trim(coalesce(p_reason, '')), '')
     where id = p_change_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivate / reactivate
-- ---------------------------------------------------------------------------
-- Removing access is immediate (HR or Leader; only a Leader for a Leader account).
-- Step 5.5 will add: blocked while the person still owns open tasks, projects or issues.
create or replace function public.deactivate_profile(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.profiles;
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR or a Leader can deactivate.');
  perform public.require(p_profile_id <> (select auth.uid()), 'You cannot deactivate yourself.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason.');
  select * into v_p from public.profiles where id = p_profile_id for update;
  perform public.require(found, 'Employee not found.');
  perform public.require(v_p.active, 'Already inactive.');
  perform public.require(v_p.access_level <> 'leader' or public.is_leader(), 'Only a Leader can deactivate a Leader account.');
  update public.profiles set active = false, access_changed_at = now() where id = p_profile_id;
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, new)
  values ((select auth.uid()), 'deactivate', 'profiles', p_profile_id::text, p_profile_id, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Giving access back is giving access: Leader only.
create or replace function public.reactivate_profile(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader can reactivate an account.');
  perform public.require(p_profile_id <> (select auth.uid()), 'You cannot reactivate yourself.');
  update public.profiles set active = true, access_changed_at = now() where id = p_profile_id and not active;
  perform public.require(found, 'Already active.');
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, new)
  values ((select auth.uid()), 'reactivate', 'profiles', p_profile_id::text, p_profile_id, jsonb_build_object('reason', trim(coalesce(p_reason, ''))));
end;
$$;

-- ---------------------------------------------------------------------------
-- Count of items waiting for the caller (menu badge)
-- ---------------------------------------------------------------------------
create or replace function public.access_inbox_count()
returns int language sql stable security definer set search_path = '' as $$
  select case
    when public.is_leader() then
      (select count(*) from public.access_requests r where r.status = 'proposed' and r.user_id <> (select auth.uid()))
      + (select count(*) from public.invites i where i.status = 'proposed' and i.invited_by <> (select auth.uid()))
      + (select count(*) from public.access_changes c where c.status = 'proposed' and c.proposed_by <> (select auth.uid()))
    when public.has_hr() then
      (select count(*) from public.access_requests r where r.status in ('pending', 'sent_back') and r.user_id <> (select auth.uid()))
    else 0 end::int;
$$;

-- Lock down: callable by signed-in users only (each function checks the caller itself).
revoke execute on function
  public.my_email(), public.has_profile(), public.next_employee_id(), public.welcome_options(),
  public.submit_access_request(text, uuid, text, uuid, text), public.claim_invite(),
  public.propose_access_request(uuid, public.access_level, boolean, boolean, uuid),
  public.approve_access_request(uuid, public.access_level, boolean, boolean, uuid),
  public.send_back_access_request(uuid, text), public.decline_access_request(uuid, text),
  public.create_invite(text, text, text, uuid, uuid, public.access_level, boolean, boolean),
  public.decide_invite(uuid, boolean, text),
  public.propose_access_change(uuid, public.access_level, boolean, boolean, text),
  public.decide_access_change(uuid, boolean, text),
  public.deactivate_profile(uuid, text), public.reactivate_profile(uuid, text),
  public.access_inbox_count()
from public, anon;
grant execute on function
  public.welcome_options(), public.submit_access_request(text, uuid, text, uuid, text), public.claim_invite(),
  public.propose_access_request(uuid, public.access_level, boolean, boolean, uuid),
  public.approve_access_request(uuid, public.access_level, boolean, boolean, uuid),
  public.send_back_access_request(uuid, text), public.decline_access_request(uuid, text),
  public.create_invite(text, text, text, uuid, uuid, public.access_level, boolean, boolean),
  public.decide_invite(uuid, boolean, text),
  public.propose_access_change(uuid, public.access_level, boolean, boolean, text),
  public.decide_access_change(uuid, boolean, text),
  public.deactivate_profile(uuid, text), public.reactivate_profile(uuid, text),
  public.access_inbox_count()
to authenticated;
revoke execute on function public.my_email(), public.has_profile(), public.next_employee_id() from authenticated;

-- New records start "unchanged", so a newly approved or invited person isn't signed out right away.
-- Only real changes (apply_access, deactivate, reactivate) set access_changed_at to now().
alter table public.profiles alter column access_changed_at set default 'epoch';
update public.profiles set access_changed_at = 'epoch';
