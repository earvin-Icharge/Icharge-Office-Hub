-- Philippine national holidays for 2026 and 2027 (owner request, 26 Nov 2026). HR can still add, change or remove days.
-- 2026: Proclamation No. 1006 (s. 2025); Eid'l Fitr 20 Mar and Eid'l Adha 27 May 2026 (Proclamation No. 1264) declared separately.
-- 2027: Proclamation No. 1427 (s. 2026); Eid'l Fitr and Eid'l Adha 2027 will be declared separately (HR adds them then).
-- Special working days (e.g. EDSA anniversary, 25 Feb) are normal working days and are not listed.
insert into public.holidays (day, name, kind) values
  ('2026-01-01', 'New Year''s Day', 'regular'),
  ('2026-02-17', 'Chinese New Year', 'special'),
  ('2026-03-20', 'Eid''l Fitr', 'regular'),
  ('2026-04-02', 'Maundy Thursday', 'regular'),
  ('2026-04-03', 'Good Friday', 'regular'),
  ('2026-04-04', 'Black Saturday', 'special'),
  ('2026-04-09', 'Araw ng Kagitingan', 'regular'),
  ('2026-05-01', 'Labor Day', 'regular'),
  ('2026-05-27', 'Eid''l Adha', 'regular'),
  ('2026-06-12', 'Independence Day', 'regular'),
  ('2026-08-21', 'Ninoy Aquino Day', 'special'),
  ('2026-08-31', 'National Heroes Day', 'regular'),
  ('2026-11-01', 'All Saints'' Day', 'special'),
  ('2026-11-02', 'All Souls'' Day', 'special'),
  ('2026-11-30', 'Bonifacio Day', 'regular'),
  ('2026-12-08', 'Feast of the Immaculate Conception', 'special'),
  ('2026-12-24', 'Christmas Eve', 'special'),
  ('2026-12-25', 'Christmas Day', 'regular'),
  ('2026-12-30', 'Rizal Day', 'regular'),
  ('2026-12-31', 'Last Day of the Year', 'special'),
  ('2027-01-01', 'New Year''s Day', 'regular'),
  ('2027-02-06', 'Chinese New Year', 'special'),
  ('2027-03-25', 'Maundy Thursday', 'regular'),
  ('2027-03-26', 'Good Friday', 'regular'),
  ('2027-03-27', 'Black Saturday', 'special'),
  ('2027-04-09', 'Araw ng Kagitingan', 'regular'),
  ('2027-05-01', 'Labor Day', 'regular'),
  ('2027-06-12', 'Independence Day', 'regular'),
  ('2027-08-21', 'Ninoy Aquino Day', 'special'),
  ('2027-08-30', 'National Heroes Day', 'regular'),
  ('2027-11-01', 'All Saints'' Day', 'special'),
  ('2027-11-02', 'All Souls'' Day', 'special'),
  ('2027-11-30', 'Bonifacio Day', 'regular'),
  ('2027-12-08', 'Feast of the Immaculate Conception', 'special'),
  ('2027-12-24', 'Christmas Eve', 'special'),
  ('2027-12-25', 'Christmas Day', 'regular'),
  ('2027-12-30', 'Rizal Day', 'regular'),
  ('2027-12-31', 'Last Day of the Year', 'special')
on conflict (day) do nothing;

-- Calendar: who is on leave (owner decision 26 Nov 2026). Everyone sees names and dates of approved leave (no type, no reason);
-- those who may see the request (the person, approver, Manager, HR, Leader) also see pending requests and the leave type.
create or replace function public.calendar_leave(p_from date, p_to date)
returns table (request_id uuid, profile_id uuid, name text, start_date date, end_date date, status text, type_name text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.profile_id, p.name, r.start_date, r.end_date, r.status,
         case when public.can_see_leave(r.profile_id, r.approver_id, r.status) then t.name end
    from public.leave_requests r
    join public.profiles p on p.id = r.profile_id
    join public.leave_types t on t.id = r.type_id
   where public.is_active_user()
     and r.start_date <= p_to and r.end_date >= p_from
     and (r.status = 'approved' or (r.status = 'pending' and public.can_see_leave(r.profile_id, r.approver_id, r.status)))
   order by r.start_date, p.name;
$$;
revoke execute on function public.calendar_leave(date, date) from public, anon;
grant execute on function public.calendar_leave(date, date) to authenticated;
