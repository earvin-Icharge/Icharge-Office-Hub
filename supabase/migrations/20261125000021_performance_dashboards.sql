-- Step 11: performance snapshot, quarterly reviews, business metrics for dashboards (SPEC.md 4.1, 5.6, 8).

create table public.business_metrics (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  business public.business not null check (business in ('icharge', 'iscreen')),
  metric text not null check (metric in ('kiosk_locations', 'rentals_per_day', 'rental_sales_per_day', 'repeat_customer_rate',
                                         'slots_sold', 'proposals_waiting', 'ad_sales_month')),
  value numeric(14, 2) not null,
  note text,
  entered_by uuid references public.profiles (id),
  entered_at timestamptz not null default now(),
  unique (month, business, metric)
);
create trigger business_metrics_audit after insert or update or delete on public.business_metrics for each row execute function public.audit_row();

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  quarter text not null check (quarter ~ '^\d{4}-Q[1-4]$'),
  ratings jsonb not null,                -- {quality, timeliness, teamwork, communication, initiative}: 1–5
  comments text,
  written_by uuid not null references public.profiles (id),
  written_at timestamptz not null default now(),
  hr_signed_by uuid references public.profiles (id),
  hr_signed_at timestamptz,
  unique (profile_id, quarter)
);
create trigger reviews_audit after insert or update or delete on public.reviews for each row execute function public.audit_row();

create or replace function public.can_see_performance(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (p_profile = (select auth.uid()) or public.is_leader() or public.has_hr() or public.is_manager_of(p_profile));
$$;

-- Monthly snapshot from real data (spec 5.6).
create or replace function public.performance_snapshot(p_profile uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m0 date := date_trunc('month', p_month)::date;
  m1 date := (date_trunc('month', p_month) + interval '1 month')::date;
  t0 timestamptz := m0::timestamp at time zone 'Asia/Manila';
  t1 timestamptz := m1::timestamp at time zone 'Asia/Manila';
  v_upto date := least(m1 - 1, public.manila_now()::date);
  r jsonb;
  v_cs jsonb := null;
begin
  perform public.require(public.can_see_performance(p_profile), 'Not allowed.');
  if exists (select 1 from public.profiles p join public.departments d on d.id = p.department_id where p.id = p_profile and d.code = 'cs') then
    -- CS KPIs computed here for the person (the snapshot's own access rule already applies).
    with c as (select x.*, ty.fix_minutes from public.cs_cases x join public.cs_case_types ty on ty.code = x.type_code where x.owner_id = p_profile and x.deleted_at is null),
         created as (select * from c where created_at >= t0 and created_at < t1),
         solved as (select *, greatest(0, extract(epoch from solved_at - created_at) / 60 - waiting_clock_minutes) as solve_clock from c where solved_at >= t0 and solved_at < t1)
    select jsonb_build_object(
      'reply_15', (select round(100.0 * count(*) filter (where first_reply_at is not null and public.cs_working_minutes(created_at, first_reply_at) <= case when channel = 'email' then 240 else 15 end) / nullif(count(*), 0), 1) from created),
      'solved_in_target', (select round(100.0 * count(*) filter (where solve_clock <= fix_minutes) / nullif(count(*), 0), 1) from solved),
      'rating', (select round(avg(rating), 2) from solved where rating is not null),
      'handled', (select count(*) from solved),
      'quality', (select round(avg(score), 2) from public.cs_quality_reviews where profile_id = p_profile and month = m0)) into v_cs;
  end if;
  select jsonb_build_object(
    'tasks_completed', (select count(*) from public.tasks where owner_id = p_profile and deleted_at is null and status = 'done' and completed_at >= t0 and completed_at < t1),
    'on_time_pct', (select round(100.0 * count(*) filter (where completed_at <= due_at) / nullif(count(*), 0), 1) from public.tasks
                     where owner_id = p_profile and deleted_at is null and status = 'done' and completed_at >= t0 and completed_at < t1),
    'overdue', (select count(*) from public.tasks where owner_id = p_profile and deleted_at is null and status in ('todo', 'in_progress', 'waiting') and due_at < least(now(), t1)),
    'reopened', (select coalesce(sum(reopen_count), 0) from public.tasks where owner_id = p_profile and deleted_at is null and completed_at >= t0 and completed_at < t1),
    'issues_in_target_pct', (select round(100.0 * count(*) filter (where resolved_at <= fix_due) / nullif(count(*), 0), 1) from public.issues
                              where owner_id = p_profile and deleted_at is null and resolved_at >= t0 and resolved_at < t1),
    'issues_handled', (select count(*) from public.issues where owner_id = p_profile and deleted_at is null and resolved_at >= t0 and resolved_at < t1),
    'lates', (select count(*) filter (where late_minutes > 0) from public.attendance where profile_id = p_profile and day >= m0 and day < m1),
    'late_minutes', (select coalesce(sum(late_minutes), 0) from public.attendance where profile_id = p_profile and day >= m0 and day < m1),
    'undertime_minutes', (select coalesce(sum(undertime_minutes), 0) from public.attendance where profile_id = p_profile and day >= m0 and day < m1),
    'outside_location', (select count(*) from public.attendance where profile_id = p_profile and day >= m0 and day < m1 and 'outside_radius' = any (flags)),
    'absences', (select count(*) from generate_series(m0, v_upto, interval '1 day') d
                  where public.is_working_day(d::date) and d::date >= coalesce((select start_date from public.hr_records where profile_id = p_profile), m0)
                    and not exists (select 1 from public.attendance a where a.profile_id = p_profile and a.day = d::date)
                    and not public.on_leave(p_profile, d::date)),
    'cs', v_cs
  ) into r;
  return r;
end;
$$;

-- Quarterly review: written by the Manager (own team), signed off by HR (spec 5.6).
create or replace function public.save_review(p_profile uuid, p_quarter text, p_ratings jsonb, p_comments text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_manager_of(p_profile) or public.is_leader(), 'The Manager writes the review.');
  perform public.require(p_profile <> (select auth.uid()), 'You cannot review yourself.');
  insert into public.reviews (profile_id, quarter, ratings, comments, written_by)
  values (p_profile, p_quarter, p_ratings, nullif(trim(coalesce(p_comments, '')), ''), (select auth.uid()))
  on conflict (profile_id, quarter) do update set ratings = excluded.ratings, comments = excluded.comments, written_by = excluded.written_by,
    written_at = now(), hr_signed_by = null, hr_signed_at = null;
  perform public.notify(h, 'review', 'Review to sign off', null, '/performance?who=' || p_profile, 'profile', p_profile) from public.hr_users() h where h <> p_profile;
end;
$$;

create or replace function public.sign_review(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_id for update;
  perform public.require(found and public.can_edit_hr(r.profile_id), 'HR signs off reviews.');
  update public.reviews set hr_signed_by = (select auth.uid()), hr_signed_at = now() where id = p_id;
  perform public.notify(r.profile_id, 'review', 'Your quarterly review is ready', null, '/performance', 'profile', r.profile_id);
end;
$$;

create or replace function public.save_business_metric(p_month date, p_business public.business, p_metric text, p_value numeric, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader() or public.has_finance() or public.heads_department('ops'), 'Finance, the Ops head or a Leader enters these figures.');
  insert into public.business_metrics (month, business, metric, value, note, entered_by)
  values (date_trunc('month', p_month)::date, p_business, p_metric, p_value, nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()))
  on conflict (month, business, metric) do update set value = excluded.value, note = excluded.note, entered_by = excluded.entered_by, entered_at = now();
end;
$$;

-- Counts across the company for dashboards (rows each viewer may see are filtered in the app; these are only totals by group).
create or replace function public.dashboard_counts(p_business text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; v_today date := public.manila_now()::date;
begin
  perform public.require(public.is_leader() or public.has_hr() or public.has_finance()
    or exists (select 1 from public.profiles where id = (select auth.uid()) and access_level = 'manager' and active), 'Not allowed.');
  select jsonb_build_object(
    'by_department', (select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object('id', d.id, 'name', d.name,
          'open', count(t.id) filter (where t.status in ('todo', 'in_progress', 'waiting')),
          'overdue', count(t.id) filter (where t.status in ('todo', 'in_progress', 'waiting') and t.due_at < now()),
          'done_month', count(t.id) filter (where t.status = 'done' and t.completed_at >= date_trunc('month', now())),
          'on_time_month', count(t.id) filter (where t.status = 'done' and t.completed_at >= date_trunc('month', now()) and t.completed_at <= t.due_at)) x
        from public.departments d left join public.profiles p on p.department_id = d.id
        left join public.tasks t on t.owner_id = p.id and t.deleted_at is null and t.assign_state = 'accepted' and (p_business = 'all' or t.business::text = p_business)
        group by d.id, d.name) s),
    'projects', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.projects where deleted_at is null and (p_business = 'all' or business::text = p_business) group by status) s),
    'issues_late_by_type', (select jsonb_agg(jsonb_build_object('name', it.name, 'n', s.n) order by s.n desc) from
        (select type_id, count(*) n from public.issues where deleted_at is null and status not in ('resolved', 'closed') and fix_due < now() and (p_business = 'all' or business::text = p_business) group by type_id) s
        join public.issue_types it on it.id = s.type_id),
    'open_issues', (select jsonb_object_agg(business, n) from (select business, count(*) n from public.issues where deleted_at is null and status not in ('resolved', 'closed') group by business) s),
    'attendance', jsonb_build_object(
        'office', (select count(*) from public.attendance where day = v_today and mode = 'office'),
        'wfh', (select count(*) from public.attendance where day = v_today and mode = 'wfh'),
        'field', (select count(*) from public.attendance where day = v_today and mode = 'field'),
        'leave', (select count(distinct profile_id) from public.leave_requests where status = 'approved' and v_today between start_date and end_date),
        'not_in', (select count(*) from public.profiles p where p.active and not exists (select 1 from public.attendance a where a.profile_id = p.id and a.day = v_today)
                     and not public.on_leave(p.id, v_today)),
        'flags', (select count(*) from public.attendance where reviewed_at is null and flags <> '{}')),
    'pending', jsonb_build_object(
        'leave', (select count(*) from public.leave_requests where status = 'pending'),
        'access', (select count(*) from public.access_requests where status in ('pending', 'proposed', 'sent_back')),
        'refunds', (select count(*) from public.cs_refund_requests where status in ('requested', 'approved')),
        'reviews_to_sign', (select count(*) from public.reviews where hr_signed_at is null)),
    'probation_due', (select count(*) from public.hr_records h join public.profiles p on p.id = h.profile_id
        where p.active and h.employment_status = 'probationary' and h.start_date + make_interval(months => (public.setting('probation_months') #>> '{}')::int) between v_today and v_today + 30)
  ) into r;
  return r;
end;
$$;

alter table public.business_metrics enable row level security;
alter table public.reviews enable row level security;
create policy "metrics: dashboard viewers" on public.business_metrics for select to authenticated
  using (public.is_leader() or public.has_finance() or exists (select 1 from public.profiles where id = (select auth.uid()) and access_level = 'manager' and active));
create policy "reviews: visible" on public.reviews for select to authenticated using (public.can_see_performance(profile_id));
grant select on public.business_metrics, public.reviews to authenticated;
grant all on public.business_metrics, public.reviews to service_role;

do $$
declare f text;
begin
  foreach f in array array['performance_snapshot(uuid, date)', 'save_review(uuid, text, jsonb, text)', 'sign_review(uuid)', 'save_business_metric(date, public.business, text, numeric, text)',
    'dashboard_counts(text)', 'can_see_performance(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
