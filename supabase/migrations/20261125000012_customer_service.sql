-- Step 6c: customer service cases, transaction trail, quick replies, refunds, handoffs, ratings, KPIs (SPEC.md 4.9).

insert into public.app_settings (key, value) values
  ('cs_hours', '{"start": "08:00", "end": "20:00", "days": [1,2,3,4,5,6,7]}'),
  ('cs_anonymize_years', '2')
on conflict do nothing;

create table public.cs_case_types (
  code text primary key,
  name_en text not null,
  name_zh text not null,
  fix_minutes int not null,
  issue_type_id uuid references public.issue_types (id),
  position int not null default 0
);
insert into public.cs_case_types (code, name_en, name_zh, fix_minutes, issue_type_id, position)
select v.code, v.en, v.zh, v.fix, (select id from public.issue_types where name = v.issue), v.pos
from (values
  ('charged_no_release', 'Charged but no power bank released', '已扣款但未弹出充电宝', 4320, 'Customer charged / deposit not refunded', 1),
  ('deposit_not_refunded', 'Deposit refund not received', '押金未退还', 4320, 'Customer charged / deposit not refunded', 2),
  ('not_returned', 'Power bank not returned', '充电宝未归还', 10080, 'Unpaid or unreturned power bank', 3),
  ('app_payment', 'App or payment error', '应用或支付错误', 2880, 'App or payment error', 4),
  ('kiosk_problem', 'Kiosk problem', '设备问题', 1440, 'Kiosk offline, empty or screen down', 5),
  ('question', 'Question', '咨询', 480, null, 6),
  ('complaint', 'Complaint', '投诉', 1440, null, 7),
  ('other', 'Other', '其他', 1440, null, 8)
) v(code, en, zh, fix, issue, pos);

create table public.cs_cases (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,
  channel text not null check (channel in ('hotline', 'viber', 'facebook', 'app', 'email', 'walkin')),
  customer_name text,
  customer_mobile text,
  order_no text,
  kiosk_id text,
  location text,
  amount numeric(12, 2),
  business public.business not null default 'icharge',
  type_code text not null references public.cs_case_types (code),
  status text not null default 'open' check (status in ('open', 'waiting_customer', 'waiting_finance', 'sent_to_ops', 'solved')),
  owner_id uuid not null references public.profiles (id),
  issue_id uuid references public.issues (id),
  created_at timestamptz not null default now(),
  first_reply_at timestamptz,
  solved_at timestamptz,
  reopened_at timestamptz,
  reopen_count int not null default 0,
  rating int check (rating between 1 and 5),
  rating_requested_at timestamptz,
  waiting_since timestamptz,
  waiting_work_minutes int not null default 0,   -- CS working minutes spent "Waiting on customer" (clock stops)
  waiting_clock_minutes int not null default 0,
  anonymized_at timestamptz,
  deleted_at timestamptz
);
create index cs_cases_owner_idx on public.cs_cases (owner_id, created_at desc);
create index cs_cases_kiosk_idx on public.cs_cases (kiosk_id, created_at);

-- The transaction trail. Entries can't be changed or deleted.
create table public.cs_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cs_cases (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  kind text not null check (kind in ('customer', 'reply', 'action', 'handoff', 'system', 'note')),
  text text not null,
  quick_reply_id uuid
);
create index cs_case_events_case_idx on public.cs_case_events (case_id, at);
create or replace function public.cs_events_locked()
returns trigger language plpgsql as $$
begin
  if current_setting('oh.anonymizing', true) = 'on' then return coalesce(new, old); end if;
  raise exception 'The transaction trail cannot be changed or deleted.';
end;
$$;
create trigger cs_case_events_lock before update or delete on public.cs_case_events for each row execute function public.cs_events_locked();

create table public.cs_refund_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cs_cases (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null,
  order_no text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected')),
  requested_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  paid_by uuid references public.profiles (id),
  paid_at timestamptz,
  reference_no text,
  note text,
  created_at timestamptz not null default now()
);
create trigger cs_refunds_audit after insert or update or delete on public.cs_refund_requests for each row execute function public.audit_row();

create table public.cs_quick_replies (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en', 'fil')),
  title text not null,
  text text not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
insert into public.cs_quick_replies (language, title, text) values
  ('en', 'Thanks, checking', 'Thank you for reaching out to iCharge! We are checking your concern now and will update you shortly.'),
  ('fil', 'Salamat, chine-check', 'Salamat po sa pag-message sa iCharge! Chine-check na po namin ang inyong concern at babalikan po namin kayo agad.'),
  ('en', 'Refund on the way', 'Your refund has been processed. It may take 1–3 business days to reflect. Thank you for your patience!'),
  ('fil', 'Refund naproseso na', 'Naproseso na po ang inyong refund. Maaaring abutin ng 1–3 business days bago ito pumasok. Salamat po sa pasensya!');

create table public.cs_targets (
  kpi text primary key check (kpi in ('reply_15', 'solved_in_target', 'avg_solve_hours', 'rating', 'reopened')),
  target numeric not null,
  set_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.cs_targets (kpi, target) values ('reply_15', 90), ('solved_in_target', 90), ('avg_solve_hours', 8), ('rating', 4.5), ('reopened', 5);
create trigger cs_targets_audit after insert or update or delete on public.cs_targets for each row execute function public.audit_row();

create table public.cs_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  month date not null,
  case_id uuid not null references public.cs_cases (id) on delete cascade,
  score int not null check (score between 1 and 5),
  note text,
  reviewer_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (case_id)
);

-- SMS to customers (refund paid, rating request). Sent once an SMS provider is connected.
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  to_mobile text not null,
  text text not null,
  case_id uuid references public.cs_cases (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

-- ---------------------------------------------------------------------------
-- Access (spec 3.3 "Customer service cases and KPIs", 4.9 privacy)
-- ---------------------------------------------------------------------------
create or replace function public.is_cs_lead()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.heads_department('cs');
$$;
create or replace function public.in_cs()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.departments d on d.id = p.department_id where p.id = (select auth.uid()) and p.active and d.code = 'cs');
$$;

create or replace function public.can_see_case(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.cs_cases c where c.id = p_case and c.deleted_at is null and (
      public.is_leader() or public.is_cs_lead() or c.owner_id = (select auth.uid())
      or (c.issue_id is not null and public.can_see_issue(c.issue_id))));   -- kiosk cases handed to Ops / other departments
$$;

-- Full customer name and mobile: case owner, CS lead, Leader only.
create or replace function public.can_see_customer(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or public.is_cs_lead() or exists (select 1 from public.cs_cases c where c.id = p_case and c.owner_id = (select auth.uid()));
$$;

create or replace function public.can_work_case(p_case uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or public.is_cs_lead() or exists (select 1 from public.cs_cases c where c.id = p_case and c.owner_id = (select auth.uid()) and c.deleted_at is null);
$$;

create or replace function public.mask_name(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null else (select string_agg(left(w, 1) || repeat('*', greatest(length(w) - 1, 1)), ' ') from unnest(string_to_array(p, ' ')) w) end;
$$;
create or replace function public.mask_mobile(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null else repeat('*', greatest(length(p) - 3, 0)) || right(p, 3) end;
$$;

-- ---------------------------------------------------------------------------
-- CS working time and KPIs (fair counting)
-- ---------------------------------------------------------------------------
create or replace function public.cs_working_minutes(p_from timestamptz, p_to timestamptz)
returns int language plpgsql stable security definer set search_path = '' as $$
declare
  h jsonb := public.setting('cs_hours');
  s time := (h ->> 'start')::time;
  e time := (h ->> 'end')::time;
  a timestamp := p_from at time zone 'Asia/Manila';
  b timestamp := p_to at time zone 'Asia/Manila';
  d date;
  total int := 0;
  lo timestamp; hi timestamp;
begin
  if p_from is null or p_to is null or p_to <= p_from then return 0; end if;
  if b - a > interval '120 days' then a := b - interval '120 days'; end if;
  d := a::date;
  while d <= b::date loop
    if extract(isodow from d)::int in (select jsonb_array_elements_text(h -> 'days')::int) then
      lo := greatest(a, d + s); hi := least(b, d + e);
      if hi > lo then total := total + (extract(epoch from hi - lo) / 60)::int; end if;
    end if;
    d := d + 1;
  end loop;
  return total;
end;
$$;

-- KPIs for one person (or the whole team when p_profile is null) for a month.
create or replace function public.cs_kpis(p_profile uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m0 timestamptz := (date_trunc('month', p_month)::date)::timestamp at time zone 'Asia/Manila';
  m1 timestamptz := ((date_trunc('month', p_month) + interval '1 month')::date)::timestamp at time zone 'Asia/Manila';
  r jsonb;
begin
  perform public.require(public.is_leader() or public.is_cs_lead() or p_profile = (select auth.uid()), 'Not allowed.');
  with c as (
    select x.*, t.fix_minutes from public.cs_cases x join public.cs_case_types t on t.code = x.type_code
     where x.deleted_at is null and (p_profile is null or x.owner_id = p_profile)
  ), created as (select * from c where created_at >= m0 and created_at < m1),
     solved as (select *, greatest(0, extract(epoch from solved_at - created_at) / 60 - waiting_clock_minutes) as solve_clock,
                          greatest(0, public.cs_working_minutes(created_at, solved_at) - waiting_work_minutes) as solve_work
                  from c where solved_at >= m0 and solved_at < m1)
  select jsonb_build_object(
    'cases', (select count(*) from created),
    'reply_15', (select round(100.0 * count(*) filter (where first_reply_at is not null and
                   public.cs_working_minutes(created_at, first_reply_at) <= case when channel = 'email' then 240 else 15 end) / nullif(count(*), 0), 1) from created),
    'solved_in_target', (select round(100.0 * count(*) filter (where solve_clock <= fix_minutes) / nullif(count(*), 0), 1) from solved),
    'avg_solve_hours', (select round(avg(solve_work) / 60.0, 1) from solved),
    'rating', (select round(avg(rating), 2) from solved where rating is not null),
    'reopened', (select round(100.0 * count(*) filter (where reopen_count > 0) / nullif(count(*), 0), 1) from solved),
    'handled', (select count(*) from solved),
    'quality', (select round(avg(q.score), 2) from public.cs_quality_reviews q where q.month = date_trunc('month', p_month)::date and (p_profile is null or q.profile_id = p_profile))
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
create or replace function public.cs_event(p_case uuid, p_kind text, p_text text, p_quick uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.cs_case_events (case_id, actor_id, kind, text, quick_reply_id) values (p_case, (select auth.uid()), p_kind, p_text, p_quick);
$$;
revoke execute on function public.cs_event(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.create_case(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owner uuid;
begin
  perform public.require(public.in_cs() or public.is_cs_lead() or public.is_leader(), 'Only Customer service can create cases.');
  v_owner := case when (public.is_cs_lead() or public.is_leader()) and nullif(p ->> 'owner_id', '') is not null then (p ->> 'owner_id')::uuid else (select auth.uid()) end;
  insert into public.cs_cases (channel, customer_name, customer_mobile, order_no, kiosk_id, location, amount, business, type_code, owner_id)
  values (p ->> 'channel', nullif(trim(coalesce(p ->> 'customer_name', '')), ''), nullif(regexp_replace(coalesce(p ->> 'customer_mobile', ''), '[^0-9+]', '', 'g'), ''),
          nullif(trim(coalesce(p ->> 'order_no', '')), ''), nullif(upper(trim(coalesce(p ->> 'kiosk_id', ''))), ''), nullif(trim(coalesce(p ->> 'location', '')), ''),
          nullif(p ->> 'amount', '')::numeric, coalesce(nullif(p ->> 'business', '')::public.business, 'icharge'), p ->> 'type_code', v_owner)
  returning id into v_id;
  if length(trim(coalesce(p ->> 'message', ''))) > 0 then
    perform public.cs_event(v_id, 'customer', trim(p ->> 'message'));
  end if;
  perform public.cs_event(v_id, 'system', 'Case created');
  return v_id;
end;
$$;

-- Messages: customer message, CS reply (first reply starts the KPI), internal note.
create or replace function public.add_case_message(p_case uuid, p_kind text, p_text text, p_quick uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cs_cases;
begin
  select * into c from public.cs_cases where id = p_case and deleted_at is null for update;
  perform public.require(found and public.can_see_case(p_case), 'Case not found.');
  perform public.require(p_kind in ('customer', 'reply', 'note'), 'Unknown entry.');
  perform public.require(p_kind = 'note' or public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  perform public.require(length(trim(coalesce(p_text, ''))) > 0, 'Write the message.');
  perform public.cs_event(p_case, p_kind, trim(p_text), p_quick);
  if p_kind = 'reply' and c.first_reply_at is null then
    update public.cs_cases set first_reply_at = now() where id = p_case;
  end if;
  if p_kind = 'customer' and c.status = 'waiting_customer' then
    perform public.set_case_status(p_case, 'open');
  end if;
end;
$$;

create or replace function public.set_case_status(p_case uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cs_cases;
begin
  select * into c from public.cs_cases where id = p_case and deleted_at is null for update;
  perform public.require(found and public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  perform public.require(p_status in ('open', 'waiting_customer', 'solved'), 'Unknown status.');
  -- Clock stops while waiting on the customer.
  if c.status = 'waiting_customer' and c.waiting_since is not null and p_status <> 'waiting_customer' then
    update public.cs_cases set waiting_work_minutes = waiting_work_minutes + public.cs_working_minutes(waiting_since, now()),
           waiting_clock_minutes = waiting_clock_minutes + (extract(epoch from now() - waiting_since) / 60)::int, waiting_since = null where id = p_case;
  end if;
  if p_status = 'solved' then
    update public.cs_cases set status = 'solved', solved_at = now(), rating_requested_at = case when customer_mobile is not null then now() end where id = p_case;
    perform public.cs_event(p_case, 'action', 'Marked solved');
    if c.customer_mobile is not null then
      insert into public.sms_outbox (to_mobile, text, case_id) values (c.customer_mobile,
        'iCharge: Your case #' || c.ref || ' is solved. How did we do? Reply 1 (poor) to 5 (great). Salamat po!', p_case);
      perform public.cs_event(p_case, 'system', 'Rating request sent to the customer');
    end if;
  elsif p_status = 'waiting_customer' then
    update public.cs_cases set status = 'waiting_customer', waiting_since = now() where id = p_case;
    perform public.cs_event(p_case, 'action', 'Waiting on customer (clock stopped)');
  else
    if c.status = 'solved' then
      perform public.require(c.solved_at > now() - interval '7 days', 'A case can be reopened within 7 days of solving it. Create a new case instead.');
      update public.cs_cases set status = 'open', reopened_at = now(), reopen_count = reopen_count + 1, solved_at = null where id = p_case;
      perform public.cs_event(p_case, 'action', 'Reopened: the customer came back');
    else
      update public.cs_cases set status = 'open' where id = p_case;
      perform public.cs_event(p_case, 'action', 'Back to open');
    end if;
  end if;
end;
$$;

create or replace function public.set_case_rating(p_case uuid, p_rating int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  update public.cs_cases set rating = p_rating where id = p_case;
  perform public.cs_event(p_case, 'system', 'Customer rating: ' || p_rating || '/5');
end;
$$;

-- Ask Finance to refund.
create or replace function public.request_refund(p_case uuid, p_amount numeric, p_method text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.cs_cases; v_id uuid; f uuid;
begin
  select * into c from public.cs_cases where id = p_case and deleted_at is null for update;
  perform public.require(found and public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  insert into public.cs_refund_requests (case_id, amount, payment_method, order_no, requested_by)
  values (p_case, p_amount, trim(p_method), c.order_no, (select auth.uid())) returning id into v_id;
  update public.cs_cases set status = 'waiting_finance' where id = p_case;
  perform public.cs_event(p_case, 'handoff', 'Refund requested from Finance: ₱' || p_amount || ' via ' || trim(p_method));
  for f in select id from public.profiles where active and finance_access loop
    perform public.notify(f, 'refund_request', 'Refund request: case #' || c.ref, 'Order ' || coalesce(c.order_no, '—') || '.', '/cs/refunds', 'cs_refund', v_id);
  end loop;
  return v_id;
end;
$$;

-- Finance approves and marks paid (never their own request).
create or replace function public.decide_refund(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.cs_refund_requests;
begin
  select * into r from public.cs_refund_requests where id = p_id for update;
  perform public.require(found and r.status = 'requested', 'This refund is not waiting for approval.');
  perform public.require(public.has_finance() or public.is_leader(), 'Only Finance can approve refunds.');
  perform public.require(r.requested_by <> (select auth.uid()), 'You cannot approve your own refund request.');
  update public.cs_refund_requests set status = case when p_approve then 'approved' else 'rejected' end, approved_by = (select auth.uid()), approved_at = now(),
         note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  insert into public.cs_case_events (case_id, actor_id, kind, text)
  values (r.case_id, (select auth.uid()), 'system', case when p_approve then 'Finance approved the refund' else 'Finance rejected the refund' || coalesce(': ' || nullif(trim(p_note), ''), '') end);
  if not p_approve then update public.cs_cases set status = 'open' where id = r.case_id; end if;
  perform public.notify(r.requested_by, 'refund_decided', case when p_approve then 'Refund approved' else 'Refund rejected' end, null, '/cs/' || r.case_id, 'cs_case', r.case_id);
end;
$$;

create or replace function public.mark_refund_paid(p_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.cs_refund_requests; c public.cs_cases;
begin
  select * into r from public.cs_refund_requests where id = p_id for update;
  perform public.require(found and r.status = 'approved', 'Approve the refund first.');
  perform public.require(public.has_finance() or public.is_leader(), 'Only Finance can mark refunds paid.');
  perform public.require(r.requested_by <> (select auth.uid()), 'You cannot pay your own refund request.');
  perform public.require(length(trim(coalesce(p_reference, ''))) >= 3, 'Add the reference number.');
  update public.cs_refund_requests set status = 'paid', paid_by = (select auth.uid()), paid_at = now(), reference_no = trim(p_reference) where id = p_id;
  select * into c from public.cs_cases where id = r.case_id;
  update public.cs_cases set status = 'open' where id = r.case_id and status = 'waiting_finance';
  insert into public.cs_case_events (case_id, actor_id, kind, text) values (r.case_id, (select auth.uid()), 'system', 'Refund paid: ₱' || r.amount || ', reference ' || trim(p_reference));
  if c.customer_mobile is not null then
    insert into public.sms_outbox (to_mobile, text, case_id) values (c.customer_mobile,
      'iCharge: Your refund of PHP ' || r.amount || ' for case #' || c.ref || ' was sent. Ref: ' || trim(p_reference) || '. Salamat po!', c.id);
    insert into public.cs_case_events (case_id, actor_id, kind, text) values (r.case_id, (select auth.uid()), 'system', 'SMS sent to the customer');
  end if;
  perform public.notify(r.requested_by, 'refund_paid', 'Refund paid: case #' || c.ref, 'Reference ' || trim(p_reference) || '.', '/cs/' || r.case_id, 'cs_case', r.case_id);
end;
$$;

-- Send kiosk problem to Ops: create or link an issue; 3+ cases at one kiosk in 30 days -> repeat alert.
create or replace function public.send_case_to_ops(p_case uuid, p_issue uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.cs_cases;
  t public.cs_case_types;
  v_issue uuid := p_issue;
  v_count int;
  h uuid;
begin
  select * into c from public.cs_cases where id = p_case and deleted_at is null for update;
  perform public.require(found and public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  select * into t from public.cs_case_types where code = c.type_code;
  if v_issue is null then
    v_issue := public.report_issue(jsonb_build_object('type_id', coalesce(t.issue_type_id, (select id from public.issue_types where name like 'Kiosk offline%')),
      'title', 'Case #' || c.ref || ': ' || t.name_en, 'source', 'customer_service', 'kiosk_id', coalesce(c.kiosk_id, ''), 'location', coalesce(c.location, ''),
      'notes', 'From customer service case #' || c.ref || '.'));
  end if;
  update public.cs_cases set issue_id = v_issue, status = 'sent_to_ops' where id = p_case;
  perform public.cs_event(p_case, 'handoff', 'Sent to Ops as issue ISS-' || (select ref from public.issues where id = v_issue));
  if c.kiosk_id is not null then
    select count(*) into v_count from public.cs_cases where kiosk_id = c.kiosk_id and created_at > now() - interval '30 days' and deleted_at is null;
    if v_count >= 3 and public.once(p_case, 'cs_repeat', c.kiosk_id) then
      for h in select head_id from public.departments where code in ('cs', 'ops') and head_id is not null loop
        perform public.notify(h, 'repeat_problem', 'Repeat problem at kiosk ' || c.kiosk_id, v_count || ' customer cases in 30 days.', '/cs?kiosk=' || c.kiosk_id, 'cs_case', p_case);
      end loop;
    end if;
  end if;
  return v_issue;
end;
$$;

create or replace function public.save_quick_reply(p_id uuid, p_language text, p_title text, p_text text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_cs_lead() or public.is_leader(), 'Only the CS lead can edit quick replies.');
  if p_id is null then
    insert into public.cs_quick_replies (language, title, text, created_by) values (p_language, trim(p_title), trim(p_text), (select auth.uid()));
  else
    update public.cs_quick_replies set language = p_language, title = trim(p_title), text = trim(p_text), active = p_active where id = p_id;
  end if;
end;
$$;

create or replace function public.save_cs_target(p_kpi text, p_target numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_cs_lead() or public.is_leader(), 'Only the CS lead or a Leader can set targets.');
  update public.cs_targets set target = p_target, set_by = (select auth.uid()), updated_at = now() where kpi = p_kpi;
end;
$$;

create or replace function public.add_quality_review(p_case uuid, p_score int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cs_cases;
begin
  perform public.require(public.is_cs_lead() or public.is_leader(), 'Only the CS lead reviews quality.');
  select * into c from public.cs_cases where id = p_case;
  insert into public.cs_quality_reviews (profile_id, month, case_id, score, note, reviewer_id)
  values (c.owner_id, date_trunc('month', coalesce(c.solved_at, c.created_at) at time zone 'Asia/Manila')::date, p_case, p_score, nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()))
  on conflict (case_id) do update set score = excluded.score, note = excluded.note, reviewer_id = excluded.reviewer_id;
end;
$$;

-- Customer details anonymized after 2 years (setting).
create or replace function public.run_cs_anonymize()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('oh.anonymizing', 'on', true);
  update public.cs_cases set customer_name = null, customer_mobile = null, anonymized_at = now()
   where anonymized_at is null and created_at < now() - make_interval(years => (public.setting('cs_anonymize_years') #>> '{}')::int);
  delete from public.sms_outbox where created_at < now() - interval '90 days';
end;
$$;
select cron.schedule('oh-cs-anonymize', '17 19 * * *', 'select public.run_cs_anonymize();');

-- ---------------------------------------------------------------------------
-- RLS, masked view and grants
-- ---------------------------------------------------------------------------
alter table public.cs_case_types enable row level security;
alter table public.cs_cases enable row level security;
alter table public.cs_case_events enable row level security;
alter table public.cs_refund_requests enable row level security;
alter table public.cs_quick_replies enable row level security;
alter table public.cs_targets enable row level security;
alter table public.cs_quality_reviews enable row level security;
alter table public.sms_outbox enable row level security;

create policy "cs_case_types: read" on public.cs_case_types for select to authenticated using (public.is_active_user());
create policy "cs_cases: visible" on public.cs_cases for select to authenticated using (public.can_see_case(id));
create policy "cs_case_events: visible" on public.cs_case_events for select to authenticated using (public.can_see_case(case_id));
create policy "cs_refunds: visible" on public.cs_refund_requests for select to authenticated
  using (public.has_finance() or public.is_leader() or public.is_cs_lead() or requested_by = (select auth.uid()) or public.can_see_case(case_id));
create policy "cs_quick_replies: read" on public.cs_quick_replies for select to authenticated using (public.is_active_user());
create policy "cs_targets: read" on public.cs_targets for select to authenticated using (public.is_active_user());
create policy "cs_quality: visible" on public.cs_quality_reviews for select to authenticated
  using (public.is_leader() or public.is_cs_lead() or profile_id = (select auth.uid()));

-- Customer name and mobile are never read from the table directly: only through the masked view.
grant select (id, ref, channel, order_no, kiosk_id, location, amount, business, type_code, status, owner_id, issue_id, created_at, first_reply_at, solved_at,
              reopened_at, reopen_count, rating, rating_requested_at, waiting_since, waiting_work_minutes, waiting_clock_minutes, anonymized_at, deleted_at)
  on public.cs_cases to authenticated;
-- A security-barrier view owned by the database: it alone reads the two private columns,
-- masks them for anyone who isn't the case owner, the CS lead or a Leader, and shows only cases the person may see.
create view public.cs_cases_v with (security_barrier = true) as
  select c.id, c.ref, c.channel, c.order_no, c.kiosk_id, c.location, c.amount, c.business, c.type_code, c.status, c.owner_id, c.issue_id, c.created_at,
         c.first_reply_at, c.solved_at, c.reopened_at, c.reopen_count, c.rating, c.waiting_since, c.deleted_at,
         case when public.can_see_customer(c.id) then c.customer_name else public.mask_name(c.customer_name) end as customer_name,
         case when public.can_see_customer(c.id) then c.customer_mobile else public.mask_mobile(c.customer_mobile) end as customer_mobile
    from public.cs_cases c
   where public.can_see_case(c.id);
grant select on public.cs_cases_v to authenticated;
grant select on public.cs_case_types, public.cs_case_events, public.cs_refund_requests, public.cs_quick_replies, public.cs_targets, public.cs_quality_reviews to authenticated;
grant all on public.cs_case_types, public.cs_cases, public.cs_case_events, public.cs_refund_requests, public.cs_quick_replies, public.cs_targets,
  public.cs_quality_reviews, public.sms_outbox to service_role;

do $$
declare f text;
begin
  foreach f in array array['create_case(jsonb)', 'add_case_message(uuid, text, text, uuid)', 'set_case_status(uuid, text)', 'set_case_rating(uuid, integer)',
    'request_refund(uuid, numeric, text)', 'decide_refund(uuid, boolean, text)', 'mark_refund_paid(uuid, text)', 'send_case_to_ops(uuid, uuid)',
    'save_quick_reply(uuid, text, text, text, boolean)', 'save_cs_target(text, numeric)', 'add_quality_review(uuid, integer, text)', 'cs_kpis(uuid, date)',
    'can_see_case(uuid)', 'can_see_customer(uuid)', 'can_work_case(uuid)', 'is_cs_lead()', 'in_cs()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_cs_anonymize() from public, anon, authenticated;
