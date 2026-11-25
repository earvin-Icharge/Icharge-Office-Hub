-- Step 7: HR employee records (201 file), private details, documents, onboarding / offboarding (SPEC.md 5.1, 5.5, 10).

insert into public.app_settings (key, value) values ('probation_months', '6') on conflict do nothing;

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_time time not null,
  end_time time not null,
  days int[] not null default '{1,2,3,4,5}',
  grace_minutes int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.shifts (name, start_time, end_time, days) values ('Day shift 8:00 am – 5:00 pm, Mon–Fri', '08:00', '17:00', '{1,2,3,4,5}');

-- Employment details (spec 3.3): Leader, HR (edit); Manager own team; Finance view; own.
create table public.hr_records (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  employment_status text not null default 'probationary' check (employment_status in ('probationary', 'regular', 'contractual', 'project_based', 'resigned')),
  start_date date,
  regularization_date date,
  end_date date,
  work_setup text not null default 'office' check (work_setup in ('office', 'wfh', 'hybrid')),
  shift_id uuid references public.shifts (id),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger hr_records_audit after insert or update or delete on public.hr_records for each row execute function public.audit_row();

-- Restricted details: Leader and HR; own address/contact/IDs; Finance government IDs only. Read only through functions that log views.
create table public.hr_private (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  address text,
  emergency_name text,
  emergency_phone text,
  emergency_relation text,
  sss text, philhealth text, pagibig text, tin text,
  wfh_address text,
  wfh_lat double precision,
  wfh_lng double precision,
  wfh_pending jsonb,             -- a requested WFH address change waiting for HR (spec 5.2)
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create table public.hr_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'other',
  name text not null,
  path text not null unique,
  size_bytes int,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('onboarding', 'offboarding')),
  text text not null,
  owner_role text not null check (owner_role in ('hr', 'manager', 'employee')),
  days_offset int not null default 0,
  position int not null default 0,
  active boolean not null default true
);
insert into public.checklist_templates (kind, text, owner_role, days_offset, position) values
  ('onboarding', 'Create work email and Office Hub account', 'hr', -1, 1),
  ('onboarding', 'Issue equipment (laptop, phone, ID)', 'manager', 0, 2),
  ('onboarding', 'Orientation and company policies', 'hr', 0, 3),
  ('onboarding', 'Set up quick sign-in and phone notifications', 'employee', 1, 4),
  ('onboarding', 'Collect government ID numbers and documents', 'hr', 5, 5),
  ('offboarding', 'Hand over open tasks, projects and issues', 'manager', -5, 1),
  ('offboarding', 'Collect equipment', 'manager', 0, 2),
  ('offboarding', 'Clearance and final pay papers', 'hr', 0, 3),
  ('offboarding', 'Deactivate Office Hub access', 'hr', 0, 4);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_view_employment(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (p_profile = (select auth.uid()) or public.is_leader() or public.has_hr() or public.has_finance() or public.is_manager_of(p_profile));
$$;

-- HR edits records, but an HR user's own record is handled by a Leader (conflict of interest).
create or replace function public.can_edit_hr(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or (public.has_hr() and p_profile <> (select auth.uid()));
$$;

create or replace function public.log_sensitive_view(p_subject uuid, p_what text)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, new)
  select (select auth.uid()), 'view_sensitive', p_what, p_subject::text, p_subject, jsonb_build_object('viewed', p_what)
  where p_subject <> (select auth.uid());
$$;
revoke execute on function public.log_sensitive_view(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading restricted details (each read is logged, spec 3.4)
-- ---------------------------------------------------------------------------
create or replace function public.get_hr_private(p_profile uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.hr_private; full_access boolean; own boolean;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  own := p_profile = (select auth.uid());
  full_access := public.is_leader() or public.has_hr();
  perform public.require(own or full_access or public.has_finance(), 'Not allowed.');
  select * into r from public.hr_private where profile_id = p_profile;
  if full_access or own then
    perform public.log_sensitive_view(p_profile, 'hr_private');
    return jsonb_build_object('address', r.address, 'emergency_name', r.emergency_name, 'emergency_phone', r.emergency_phone, 'emergency_relation', r.emergency_relation,
      'sss', r.sss, 'philhealth', r.philhealth, 'pagibig', r.pagibig, 'tin', r.tin,
      'wfh_address', r.wfh_address, 'wfh_lat', r.wfh_lat, 'wfh_lng', r.wfh_lng, 'wfh_pending', r.wfh_pending);
  end if;
  -- Finance: government ID numbers only, for payroll.
  perform public.log_sensitive_view(p_profile, 'gov_ids');
  return jsonb_build_object('sss', r.sss, 'philhealth', r.philhealth, 'pagibig', r.pagibig, 'tin', r.tin);
end;
$$;

-- Payroll list of government IDs (Finance, HR, Leader). Logged once per export.
create or replace function public.gov_ids_list()
returns table (profile_id uuid, name text, employee_id text, sss text, philhealth text, pagibig text, tin text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader() or public.has_hr() or public.has_finance(), 'Not allowed.');
  insert into public.audit_log (actor_id, action, table_name, new) values ((select auth.uid()), 'view_sensitive', 'gov_ids', jsonb_build_object('viewed', 'all government IDs'));
  return query select p.id, p.name, p.employee_id, h.sss, h.philhealth, h.pagibig, h.tin
    from public.profiles p left join public.hr_private h on h.profile_id = p.id order by p.name;
end;
$$;

create or replace function public.get_hr_notes(p_profile uuid)
returns table (id uuid, note text, author text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_hr(p_profile) or (public.is_leader()), 'Not allowed.');
  perform public.log_sensitive_view(p_profile, 'hr_notes');
  return query select n.id, n.note, p.name, n.created_at from public.hr_notes n join public.profiles p on p.id = n.author_id
    where n.profile_id = p_profile order by n.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editing (HR or Leader)
-- ---------------------------------------------------------------------------
create or replace function public.save_employee(p_profile uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR (or a Leader for HR''s own record) can edit employee records.');
  update public.profiles set
    name = coalesce(nullif(trim(p ->> 'name'), ''), name), employee_id = nullif(trim(coalesce(p ->> 'employee_id', '')), ''),
    position = nullif(trim(coalesce(p ->> 'position', '')), ''), phone = nullif(trim(coalesce(p ->> 'phone', '')), ''),
    department_id = nullif(p ->> 'department_id', '')::uuid, supervisor_id = nullif(p ->> 'supervisor_id', '')::uuid,
    backup_approver_id = nullif(p ->> 'backup_approver_id', '')::uuid
  where id = p_profile;
  insert into public.hr_records (profile_id, employment_status, start_date, regularization_date, end_date, work_setup, shift_id, updated_by)
  values (p_profile, coalesce(nullif(p ->> 'employment_status', ''), 'probationary'), nullif(p ->> 'start_date', '')::date, nullif(p ->> 'regularization_date', '')::date,
          nullif(p ->> 'end_date', '')::date, coalesce(nullif(p ->> 'work_setup', ''), 'office'), nullif(p ->> 'shift_id', '')::uuid, (select auth.uid()))
  on conflict (profile_id) do update set employment_status = excluded.employment_status, start_date = excluded.start_date, regularization_date = excluded.regularization_date,
    end_date = excluded.end_date, work_setup = excluded.work_setup, shift_id = excluded.shift_id, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create or replace function public.save_hr_private(p_profile uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR (or a Leader for HR''s own record) can edit private details.');
  insert into public.hr_private (profile_id, address, emergency_name, emergency_phone, emergency_relation, sss, philhealth, pagibig, tin, wfh_address, wfh_lat, wfh_lng, updated_by)
  values (p_profile, p ->> 'address', p ->> 'emergency_name', p ->> 'emergency_phone', p ->> 'emergency_relation', p ->> 'sss', p ->> 'philhealth', p ->> 'pagibig', p ->> 'tin',
          p ->> 'wfh_address', nullif(p ->> 'wfh_lat', '')::double precision, nullif(p ->> 'wfh_lng', '')::double precision, (select auth.uid()))
  on conflict (profile_id) do update set address = excluded.address, emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
    emergency_relation = excluded.emergency_relation, sss = excluded.sss, philhealth = excluded.philhealth, pagibig = excluded.pagibig, tin = excluded.tin,
    wfh_address = excluded.wfh_address, wfh_lat = excluded.wfh_lat, wfh_lng = excluded.wfh_lng, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, new)
  values ((select auth.uid()), 'update', 'hr_private', p_profile::text, p_profile, jsonb_build_object('changed', 'private details'));
end;
$$;

create or replace function public.add_hr_note(p_profile uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR can add private notes.');
  insert into public.hr_notes (profile_id, note, author_id) values (p_profile, trim(p_note), (select auth.uid()));
  insert into public.audit_log (actor_id, action, table_name, subject_profile_id, new) values ((select auth.uid()), 'insert', 'hr_notes', p_profile, jsonb_build_object('added', 'private note'));
end;
$$;

-- Employee asks to change their WFH address; HR approves before the new pin is used (spec 5.2).
create or replace function public.request_wfh_change(p_address text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = '' as $$
declare h uuid;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  insert into public.hr_private (profile_id, wfh_pending) values ((select auth.uid()), jsonb_build_object('address', p_address, 'lat', p_lat, 'lng', p_lng, 'at', now()))
  on conflict (profile_id) do update set wfh_pending = excluded.wfh_pending, updated_at = now();
  for h in select public.hr_users() loop
    perform public.notify(h, 'wfh_change', 'WFH address change to approve', (select name from public.profiles where id = (select auth.uid())), '/hr/employees/' || (select auth.uid()), 'profile', (select auth.uid()));
  end loop;
end;
$$;

create or replace function public.decide_wfh_change(p_profile uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.hr_private;
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR can approve this.');
  select * into r from public.hr_private where profile_id = p_profile for update;
  perform public.require(r.wfh_pending is not null, 'No change is waiting.');
  if p_approve then
    update public.hr_private set wfh_address = r.wfh_pending ->> 'address', wfh_lat = (r.wfh_pending ->> 'lat')::double precision,
           wfh_lng = (r.wfh_pending ->> 'lng')::double precision, wfh_pending = null, updated_by = (select auth.uid()), updated_at = now() where profile_id = p_profile;
  else
    update public.hr_private set wfh_pending = null where profile_id = p_profile;
  end if;
  perform public.notify(p_profile, 'wfh_change', case when p_approve then 'WFH address approved' else 'WFH address change not approved' end, null, '/profile', 'profile', p_profile);
end;
$$;

-- Onboarding / offboarding: the checklist becomes tasks (spec 5.5).
create or replace function public.start_checklist(p_profile uuid, p_kind text, p_date date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_owner uuid;
  v_mgr uuid;
  n int := 0;
  v_name text;
begin
  perform public.require(public.can_edit_hr(p_profile), 'Only HR can start this checklist.');
  select name into v_name from public.profiles where id = p_profile;
  select coalesce(p.supervisor_id, d.head_id) into v_mgr from public.profiles p left join public.departments d on d.id = p.department_id where p.id = p_profile;
  for c in select * from public.checklist_templates where kind = p_kind and active order by position loop
    v_owner := case c.owner_role when 'hr' then (select auth.uid()) when 'manager' then coalesce(v_mgr, (select auth.uid())) else p_profile end;
    insert into public.tasks (title, owner_id, assigned_by, due_at, business, description, acknowledged_at)
    values (initcap(p_kind) || ': ' || c.text || ' (' || v_name || ')', v_owner, (select auth.uid()),
            (p_date + c.days_offset)::timestamp at time zone 'Asia/Manila' + interval '17 hours', 'company',
            'From the ' || p_kind || ' checklist for ' || v_name || '.', case when v_owner = (select auth.uid()) then now() end);
    perform public.notify(v_owner, 'task_assigned', 'New task: ' || c.text, initcap(p_kind) || ' of ' || v_name || '.', '/tasks', 'profile', p_profile);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.save_checklist_item(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR can edit checklists.');
  if p_id is null then
    insert into public.checklist_templates (kind, text, owner_role, days_offset, position)
    values (p ->> 'kind', trim(p ->> 'text'), p ->> 'owner_role', coalesce(nullif(p ->> 'days_offset', '')::int, 0), coalesce(nullif(p ->> 'position', '')::int, 99));
  else
    update public.checklist_templates set text = trim(p ->> 'text'), owner_role = p ->> 'owner_role', days_offset = coalesce(nullif(p ->> 'days_offset', '')::int, 0),
           position = coalesce(nullif(p ->> 'position', '')::int, position), active = coalesce((p ->> 'active')::boolean, true) where id = p_id;
  end if;
end;
$$;

-- What someone still owns (must be handed over before deactivation, spec 5.5).
create or replace function public.open_items(p_profile uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tasks', (select count(*) from public.tasks where owner_id = p_profile and deleted_at is null and status in ('todo', 'in_progress', 'waiting')),
    'projects', (select count(*) from public.projects where owner_id = p_profile and deleted_at is null and status <> 'done'),
    'issues', (select count(*) from public.issues where owner_id = p_profile and deleted_at is null and status not in ('resolved', 'closed')),
    'clients', (select count(*) from public.clients where owner_id = p_profile and deleted_at is null and status <> 'ended'),
    'cases', (select count(*) from public.cs_cases where owner_id = p_profile and deleted_at is null and status <> 'solved'));
$$;

-- Deactivation is blocked while the person still owns open work.
create or replace function public.deactivate_profile(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.profiles; o jsonb;
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR or a Leader can deactivate.');
  perform public.require(p_profile_id <> (select auth.uid()), 'You cannot deactivate yourself.');
  perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason.');
  select * into v_p from public.profiles where id = p_profile_id for update;
  perform public.require(found, 'Employee not found.');
  perform public.require(v_p.active, 'Already inactive.');
  perform public.require(v_p.access_level <> 'leader' or public.is_leader(), 'Only a Leader can deactivate a Leader account.');
  o := public.open_items(p_profile_id);
  perform public.require((o ->> 'tasks')::int + (o ->> 'projects')::int + (o ->> 'issues')::int + (o ->> 'clients')::int + (o ->> 'cases')::int = 0,
    'Reassign first: ' || (o ->> 'tasks') || ' tasks, ' || (o ->> 'projects') || ' projects, ' || (o ->> 'issues') || ' issues, '
      || (o ->> 'clients') || ' clients, ' || (o ->> 'cases') || ' customer cases are still open.');
  update public.profiles set active = false, access_changed_at = now() where id = p_profile_id;
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, new)
  values ((select auth.uid()), 'deactivate', 'profiles', p_profile_id::text, p_profile_id, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Probation ending in 30 days -> HR and the Manager (spec 5.1).
create or replace function public.run_probation_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare r record; h uuid;
begin
  for r in select p.id, p.name, hr.start_date + make_interval(months => (public.setting('probation_months') #>> '{}')::int) as ends
             from public.hr_records hr join public.profiles p on p.id = hr.profile_id
            where p.active and hr.employment_status = 'probationary' and hr.start_date is not null loop
    if r.ends::date - public.manila_now()::date between 0 and 30 and public.once(r.id, 'probation_30', r.ends::date::text) then
      for h in select public.hr_users() union select public.heads_of(r.id) loop
        perform public.notify(h, 'probation', 'Probation ends ' || to_char(r.ends, 'DD Mon YYYY') || ': ' || r.name, 'Time for the probation review.', '/hr/employees/' || r.id, 'profile', r.id);
      end loop;
    end if;
  end loop;
end;
$$;
select cron.schedule('oh-probation', '13 0 * * *', 'select public.run_probation_reminders();');

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.shifts enable row level security;
alter table public.hr_records enable row level security;
alter table public.hr_private enable row level security;
alter table public.hr_notes enable row level security;
alter table public.employee_documents enable row level security;
alter table public.checklist_templates enable row level security;
create policy "shifts: read" on public.shifts for select to authenticated using (public.is_active_user());
create policy "hr_records: visible" on public.hr_records for select to authenticated using (public.can_view_employment(profile_id));
create policy "documents: leader and hr" on public.employee_documents for select to authenticated using (deleted_at is null and (public.is_leader() or public.has_hr()));
create policy "checklists: hr" on public.checklist_templates for select to authenticated using (public.has_hr() or public.is_leader());
-- hr_private and hr_notes: no policies — only through the logging functions above.
grant select on public.shifts, public.hr_records, public.employee_documents, public.checklist_templates to authenticated;
grant all on public.shifts, public.hr_records, public.hr_private, public.hr_notes, public.employee_documents, public.checklist_templates to service_role;

insert into storage.buckets (id, name, public, file_size_limit) values ('hr-documents', 'hr-documents', false, 20971520) on conflict (id) do nothing;

do $$
declare f text;
begin
  foreach f in array array['get_hr_private(uuid)', 'gov_ids_list()', 'get_hr_notes(uuid)', 'save_employee(uuid, jsonb)', 'save_hr_private(uuid, jsonb)', 'add_hr_note(uuid, text)',
    'request_wfh_change(text, double precision, double precision)', 'decide_wfh_change(uuid, boolean)', 'start_checklist(uuid, text, date)', 'save_checklist_item(uuid, jsonb)',
    'open_items(uuid)', 'can_view_employment(uuid)', 'can_edit_hr(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_probation_reminders() from public, anon, authenticated;
