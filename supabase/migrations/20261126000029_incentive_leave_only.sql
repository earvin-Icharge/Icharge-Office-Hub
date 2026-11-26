-- Owner decision (26 Nov 2026): everyone gets 5 days of Service Incentive Leave (SIL) a year; no other leave to file,
-- except the legal leaves for those who qualify (maternity, paternity, solo parent).
-- Unused SIL is paid in cash at year end: HR/Finance get the list for payroll; every 1 January starts again at 5 days.

alter table public.leave_types add column if not exists legal boolean not null default false;

update public.leave_types set active = false where code in ('vacation', 'sick', 'emergency');
update public.leave_types set name = 'Service Incentive Leave', yearly_days = 5, paid = true, active = true, position = 1 where code = 'sil';
update public.leave_types set legal = true, position = case code when 'maternity' then 2 when 'paternity' then 3 else 4 end
 where code in ('maternity', 'paternity', 'solo_parent');

-- Filing: incentive leave cannot go over what is left this year (approved + pending count).
create or replace function public.file_leave(p_type uuid, p_start date, p_end date, p_half boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_days numeric;
  v_approver uuid;
  v_id uuid;
  v_name text;
  v_code text;
  v_left numeric;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(p_end >= p_start, 'The end date is before the start date.');
  select code into v_code from public.leave_types where id = p_type and active;
  perform public.require(v_code is not null, 'This leave type is not available.');
  perform public.require(not exists (select 1 from public.leave_requests where profile_id = v_me and status in ('pending', 'approved')
                                     and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')), 'You already have leave on some of these days.');
  v_days := public.leave_days(p_start, p_end, coalesce(p_half, false));
  perform public.require(v_days > 0, 'These dates are all non-working days.');
  if v_code = 'sil' then
    perform public.require(extract(year from p_start) = extract(year from p_end), 'Incentive leave cannot cross into the next year. File it as two requests.');
    select coalesce(b.entitled, t.yearly_days) + coalesce(b.adjustment, 0)
           - coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = v_me and r.type_id = t.id
                         and r.status in ('approved', 'pending') and extract(year from r.start_date) = extract(year from p_start)), 0)
      into v_left
      from public.leave_types t left join public.leave_balances b on b.type_id = t.id and b.profile_id = v_me and b.year = extract(year from p_start)::int
     where t.id = p_type;
    perform public.require(v_days <= v_left, 'You have ' || v_left || ' incentive leave days left this year.');
  end if;
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

-- Unused incentive leave per active employee for a year (for payroll's cash conversion): HR, Finance, Leader.
create or replace function public.unused_incentive_leave(p_year int)
returns table (profile_id uuid, employee_id text, name text, department text, entitled numeric, used numeric, pending numeric, unused numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader() or public.has_hr() or public.has_finance(), 'Only HR, Finance or a Leader can see this list.');
  return query
    select p.id, p.employee_id, p.name, d.name,
           coalesce(b.entitled, t.yearly_days) + coalesce(b.adjustment, 0),
           coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p.id and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = p_year), 0),
           coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p.id and r.type_id = t.id and r.status = 'pending' and extract(year from r.start_date) = p_year), 0),
           greatest(coalesce(b.entitled, t.yearly_days) + coalesce(b.adjustment, 0)
             - coalesce((select sum(r.days) from public.leave_requests r where r.profile_id = p.id and r.type_id = t.id and r.status = 'approved' and extract(year from r.start_date) = p_year), 0), 0)
      from public.profiles p
      cross join public.leave_types t
      left join public.departments d on d.id = p.department_id
      left join public.leave_balances b on b.profile_id = p.id and b.type_id = t.id and b.year = p_year
     where p.active and t.code = 'sil'
     order by p.name;
end;
$$;
revoke execute on function public.unused_incentive_leave(int) from public, anon;
grant execute on function public.unused_incentive_leave(int) to authenticated;

-- 31 December, 9:00 am Manila: remind HR and Finance to download the list for payroll.
create or replace function public.run_incentive_leave_year_end()
returns void language plpgsql security definer set search_path = '' as $$
declare
  h uuid;
  v_year text := extract(year from public.manila_now())::text;
begin
  for h in select distinct x from (select public.hr_users() x union all select id from public.profiles where active and finance_access) s loop
    if public.once(h, 'sil_year_end', v_year) then
      perform public.notify(h, 'leave_year_end', 'Year end: unused incentive leave',
        'Download the list of unused incentive leave days for payroll (cash conversion). Everyone starts again at 5 days on 1 January.', '/hr/leave?tab=balances');
    end if;
  end loop;
end;
$$;
revoke execute on function public.run_incentive_leave_year_end() from public, anon, authenticated;
select cron.schedule('oh-sil-year-end', '3 1 31 12 *', 'select public.run_incentive_leave_year_end();');
