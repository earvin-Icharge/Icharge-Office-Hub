-- Step 10: disciplinary records with acknowledgment (SPEC.md 5.4). The app records the process; it does not decide outcomes.

create table public.disciplinary_cases (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,
  profile_id uuid not null references public.profiles (id),
  type text not null check (type in ('incident_report', 'nte', 'verbal_warning', 'written_warning', 'decision')),
  case_date date not null default current_date,
  description text not null,
  filed_by uuid not null references public.profiles (id),
  response_due date,
  acknowledged_at timestamptz,
  response text,
  responded_at timestamptz,
  decision text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  status text not null default 'open' check (status in ('open', 'waiting_response', 'responded', 'decided', 'closed')),
  parent_id uuid references public.disciplinary_cases (id),
  created_at timestamptz not null default now()
);
create trigger disciplinary_audit after insert or update or delete on public.disciplinary_cases for each row execute function public.audit_row();

-- Full view: the employee (own), HR and the Leader. Cases about an HR user: the Leader only (spec 5.4).
create or replace function public.can_see_discipline(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.disciplinary_cases c join public.profiles s on s.id = c.profile_id
     where c.id = p_case and (c.profile_id = (select auth.uid()) or public.is_leader() or (public.has_hr() and not s.hr_access)));
$$;
create or replace function public.can_handle_discipline(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or (public.has_hr() and p_profile <> (select auth.uid())
                                and not exists (select 1 from public.profiles where id = p_profile and hr_access));
$$;

-- A Manager files an incident report for their own team; HR then handles it.
create or replace function public.file_incident(p_profile uuid, p_date date, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; h uuid; v_hr boolean;
begin
  perform public.require(public.is_manager_of(p_profile) or public.can_handle_discipline(p_profile), 'You can file incident reports for your own team only.');
  perform public.require(length(trim(coalesce(p_description, ''))) >= 10, 'Describe what happened.');
  insert into public.disciplinary_cases (profile_id, type, case_date, description, filed_by)
  values (p_profile, 'incident_report', coalesce(p_date, current_date), trim(p_description), (select auth.uid())) returning id into v_id;
  select hr_access into v_hr from public.profiles where id = p_profile;
  for h in select case when v_hr then public.leaders() else public.hr_users() end loop
    if h <> p_profile then perform public.notify(h, 'discipline', 'New incident report to handle', 'Open Disciplinary records for details.', '/hr/discipline/' || v_id, 'discipline', v_id); end if;
  end loop;
  return v_id;
end;
$$;

-- HR (or the Leader) issues an NTE, warning or decision document.
create or replace function public.issue_discipline(p_profile uuid, p_type text, p_date date, p_description text, p_response_days int, p_parent uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.require(public.can_handle_discipline(p_profile), 'Only HR (or the Leader for HR staff) handles disciplinary cases.');
  perform public.require(p_type in ('nte', 'verbal_warning', 'written_warning', 'decision', 'incident_report'), 'Unknown type.');
  insert into public.disciplinary_cases (profile_id, type, case_date, description, filed_by, response_due, status, parent_id)
  values (p_profile, p_type, coalesce(p_date, current_date), trim(p_description), (select auth.uid()),
          case when p_type = 'nte' then coalesce(p_date, current_date) + coalesce(p_response_days, 5) end,
          case when p_type = 'nte' then 'waiting_response' else 'open' end, p_parent)
  returning id into v_id;
  -- Notification without details (spec 7).
  perform public.notify(p_profile, 'discipline', 'You have an HR document to acknowledge', 'Open Disciplinary records in Office Hub.', '/hr/discipline/' || v_id, 'discipline', v_id);
  return v_id;
end;
$$;

create or replace function public.acknowledge_discipline(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.disciplinary_cases set acknowledged_at = now() where id = p_id and profile_id = (select auth.uid()) and acknowledged_at is null;
  perform public.require(found, 'Only the employee can acknowledge receipt.');
end;
$$;

create or replace function public.respond_discipline(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.disciplinary_cases; h uuid;
begin
  select * into c from public.disciplinary_cases where id = p_id and profile_id = (select auth.uid()) for update;
  perform public.require(found, 'Only the employee can respond.');
  perform public.require(length(trim(coalesce(p_text, ''))) >= 3, 'Write your response.');
  update public.disciplinary_cases set response = trim(p_text), responded_at = now(), acknowledged_at = coalesce(acknowledged_at, now()),
         status = case when status in ('open', 'waiting_response') then 'responded' else status end where id = p_id;
  for h in select case when exists (select 1 from public.profiles where id = c.profile_id and hr_access) then public.leaders() else public.hr_users() end loop
    perform public.notify(h, 'discipline', 'An employee responded to an HR document', 'Open Disciplinary records for details.', '/hr/discipline/' || p_id, 'discipline', p_id);
  end loop;
end;
$$;

-- The Leader records the decision (spec 3.3).
create or replace function public.decide_discipline(p_id uuid, p_decision text, p_close boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.disciplinary_cases;
begin
  perform public.require(public.is_leader(), 'Only a Leader records the decision.');
  select * into c from public.disciplinary_cases where id = p_id for update;
  perform public.require(found and c.profile_id <> (select auth.uid()), 'Not allowed.');
  update public.disciplinary_cases set decision = trim(p_decision), decided_by = (select auth.uid()), decided_at = now(),
         status = case when p_close then 'closed' else 'decided' end where id = p_id;
  perform public.notify(c.profile_id, 'discipline', 'An HR decision was recorded', 'Open Disciplinary records in Office Hub.', '/hr/discipline/' || p_id, 'discipline', p_id);
end;
$$;

-- Managers see only the status of cases they filed or about their team (no description, response or files).
create view public.discipline_status_v with (security_barrier = true) as
  select c.id, c.ref, c.profile_id, c.type, c.case_date, c.status, c.filed_by, c.created_at
    from public.disciplinary_cases c
   where public.is_active_user() and (c.filed_by = (select auth.uid()) or public.is_manager_of(c.profile_id) or public.can_see_discipline(c.id));
grant select on public.discipline_status_v to authenticated;

alter table public.disciplinary_cases enable row level security;
create policy "discipline: full view" on public.disciplinary_cases for select to authenticated using (public.can_see_discipline(id));
grant select on public.disciplinary_cases to authenticated;
grant all on public.disciplinary_cases to service_role;

drop policy "attachments: visible files" on public.attachments;
create policy "attachments: visible files" on public.attachments for select to authenticated
  using (deleted_at is null and ((entity = 'task' and public.can_see_task(entity_id)) or (entity = 'project' and public.can_see_project(entity_id))
                                 or (entity = 'issue' and public.can_see_issue(entity_id)) or (entity = 'meeting' and public.can_see_meeting(entity_id))
                                 or (entity = 'client' and public.can_see_client(entity_id)) or (entity = 'discipline' and public.can_see_discipline(entity_id))));

create or replace function public.can_file_discipline_files(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.disciplinary_cases c where c.id = p_case and (c.profile_id = (select auth.uid()) or public.can_handle_discipline(c.profile_id)));
$$;

do $$
declare f text;
begin
  foreach f in array array['file_incident(uuid, date, text)', 'issue_discipline(uuid, text, date, text, integer, uuid)', 'acknowledge_discipline(uuid)',
    'respond_discipline(uuid, text)', 'decide_discipline(uuid, text, boolean)', 'can_see_discipline(uuid)', 'can_handle_discipline(uuid)', 'can_file_discipline_files(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
