-- Fix: pick HR users or Leaders without a set-returning function inside CASE.
create or replace function public.file_incident(p_profile uuid, p_date date, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; h uuid; v_hr boolean;
begin
  perform public.require(public.is_manager_of(p_profile) or public.can_handle_discipline(p_profile), 'You can file incident reports for your own team only.');
  perform public.require(length(trim(coalesce(p_description, ''))) >= 10, 'Describe what happened.');
  insert into public.disciplinary_cases (profile_id, type, case_date, description, filed_by)
  values (p_profile, 'incident_report', coalesce(p_date, current_date), trim(p_description), (select auth.uid())) returning id into v_id;
  select hr_access into v_hr from public.profiles where id = p_profile;
  for h in select x from public.leaders() x where v_hr union all select x from public.hr_users() x where not v_hr loop
    if h <> p_profile then perform public.notify(h, 'discipline', 'New incident report to handle', 'Open Disciplinary records for details.', '/hr/discipline/' || v_id, 'discipline', v_id); end if;
  end loop;
  return v_id;
end;
$$;

-- HR (or the Leader) issues an NTE, warning or decision document.
create or replace function public.respond_discipline(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.disciplinary_cases; h uuid;
begin
  select * into c from public.disciplinary_cases where id = p_id and profile_id = (select auth.uid()) for update;
  perform public.require(found, 'Only the employee can respond.');
  perform public.require(length(trim(coalesce(p_text, ''))) >= 3, 'Write your response.');
  update public.disciplinary_cases set response = trim(p_text), responded_at = now(), acknowledged_at = coalesce(acknowledged_at, now()),
         status = case when status in ('open', 'waiting_response') then 'responded' else status end where id = p_id;
  for h in select x from public.leaders() x where exists (select 1 from public.profiles where id = c.profile_id and hr_access)
           union all select x from public.hr_users() x where not exists (select 1 from public.profiles where id = c.profile_id and hr_access) loop
    perform public.notify(h, 'discipline', 'An employee responded to an HR document', 'Open Disciplinary records for details.', '/hr/discipline/' || p_id, 'discipline', p_id);
  end loop;
end;
$$;

-- The Leader records the decision (spec 3.3).
