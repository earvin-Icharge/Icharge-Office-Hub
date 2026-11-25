-- Fix: pick HR users or Leaders without a set-returning function inside CASE.
create or replace function public.run_access_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare r record; h uuid;
begin
  for r in select * from public.access_requests where status in ('pending', 'sent_back', 'proposed') loop
    if public.working_days_between(coalesce(r.proposed_at, r.created_at), now()) >= 2
       and public.once(r.id, 'access_reminder', r.status::text || coalesce(to_char(r.proposed_at, 'YYYYMMDDHH24MI'), '')) then
      for h in select x from public.leaders() x where r.status = 'proposed' union all select x from public.hr_users() x where r.status <> 'proposed' loop
        perform public.notify(h, 'access_reminder', 'Access request waiting 2 working days', r.full_name || ' is waiting for access.', '/settings/access', 'access_request', r.id);
      end loop;
    end if;
  end loop;
end;
$$;

