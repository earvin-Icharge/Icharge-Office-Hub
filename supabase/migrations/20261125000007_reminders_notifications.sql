-- Step 3: reminders and escalation (pg_cron), notification delivery (push, email, Telegram),
-- daily digest, Monday summary, quiet hours, access-request reminders and access emails.
-- SPEC.md 3.5, 4.3, 7.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Settings (Leader edits in Settings later). Values are JSON.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('ack_hours', '4'),                       -- acknowledge within 4 working hours
  ('work_start', '"08:00"'), ('work_end', '"17:00"'), ('work_days', '[1,2,3,4,5]'),   -- Mon–Fri
  ('quiet_start', '"21:00"'), ('quiet_end', '"07:00"'),
  ('digest_time', '"08:30"'),
  ('app_url', '"https://icharge-office-hub.vercel.app"');
alter table public.app_settings enable row level security;
create policy "settings: active staff read" on public.app_settings for select to authenticated using (public.is_active_user());
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
create trigger app_settings_audit after insert or update or delete on public.app_settings for each row execute function public.audit_row();

create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key;
$$;

-- Server-only secrets (e.g. the shared secret the database uses to call the app). No grants.
create table public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Holidays (regular / special non-working). The Holidays screen arrives in step 9.
create table public.holidays (
  day date primary key,
  name text not null,
  kind text not null default 'regular' check (kind in ('regular', 'special')),
  created_by uuid references public.profiles (id)
);
alter table public.holidays enable row level security;
create policy "holidays: active staff read" on public.holidays for select to authenticated using (public.is_active_user());
grant select on public.holidays to authenticated;
grant all on public.holidays to service_role;

-- Notification channels per person (spec 7).
alter table public.profiles
  add column notify_email boolean not null default true,
  add column notify_telegram boolean not null default true,
  add column telegram_link_code text unique;
grant update (notify_email, notify_telegram) on public.profiles to authenticated;

-- Emails to people who have no account yet (invites).
create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
alter table public.outbound_emails enable row level security;
grant all on public.outbound_emails to service_role;

-- What was already sent, so each reminder goes out once.
create table public.reminder_log (
  entity_id uuid not null,
  kind text not null,
  key text not null default '',
  sent_at timestamptz not null default now(),
  primary key (entity_id, kind, key)
);
alter table public.reminder_log enable row level security;
grant all on public.reminder_log to service_role;

alter table public.notifications add column channels text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Working time (Mon–Fri 08:00–17:00 Manila, minus holidays)
-- ---------------------------------------------------------------------------
create or replace function public.is_working_day(p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_day)::int in (select jsonb_array_elements_text(public.setting('work_days'))::int)
     and not exists (select 1 from public.holidays h where h.day = p_day);
$$;

-- Working minutes between two moments.
create or replace function public.working_minutes(p_from timestamptz, p_to timestamptz)
returns int language plpgsql stable security definer set search_path = '' as $$
declare
  d date;
  s time := (public.setting('work_start') #>> '{}')::time;
  e time := (public.setting('work_end') #>> '{}')::time;
  a timestamp := p_from at time zone 'Asia/Manila';
  b timestamp := p_to at time zone 'Asia/Manila';
  total int := 0;
  lo timestamp;
  hi timestamp;
begin
  if p_to <= p_from then return 0; end if;
  if b - a > interval '120 days' then a := b - interval '120 days'; end if;
  d := a::date;
  while d <= b::date loop
    if public.is_working_day(d) then
      lo := greatest(a, d + s);
      hi := least(b, d + e);
      if hi > lo then total := total + (extract(epoch from hi - lo) / 60)::int; end if;
    end if;
    d := d + 1;
  end loop;
  return total;
end;
$$;

create or replace function public.working_days_between(p_from timestamptz, p_to timestamptz)
returns int language sql stable security definer set search_path = '' as $$
  select (public.working_minutes(p_from, p_to) / greatest(1, extract(epoch from ((public.setting('work_end') #>> '{}')::time - (public.setting('work_start') #>> '{}')::time)) / 60))::int;
$$;

create or replace function public.manila_now()
returns timestamp language sql stable set search_path = '' as $$
  select now() at time zone 'Asia/Manila';
$$;

-- Send once: true the first time for (entity, kind, key).
create or replace function public.once(p_entity uuid, p_kind text, p_key text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reminder_log (entity_id, kind, key) values (p_entity, p_kind, coalesce(p_key, ''));
  return true;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.leaders()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where active and access_level = 'leader';
$$;
create or replace function public.hr_users()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where active and hr_access;
$$;

-- ---------------------------------------------------------------------------
-- Task reminders and escalation (spec 4.3). Runs every 15 minutes.
-- ---------------------------------------------------------------------------
create or replace function public.run_task_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
  h uuid;
  v_now timestamp := public.manila_now();
  v_today date := public.manila_now()::date;
  v_ack_min int := (public.setting('ack_hours') #>> '{}')::int * 60;
  v_day_min int := extract(epoch from ((public.setting('work_end') #>> '{}')::time - (public.setting('work_start') #>> '{}')::time)) / 60;
  v_days int;
begin
  for t in
    select * from public.tasks
     where deleted_at is null and assign_state = 'accepted' and status in ('todo', 'in_progress', 'waiting')
  loop
    -- Acknowledge within 4 working hours; after 1 working day tell the Manager.
    if t.acknowledged_at is null and t.owner_id <> t.assigned_by then
      if public.working_minutes(t.created_at, now()) >= v_ack_min and public.once(t.id, 'ack_reminder') then
        perform public.notify(t.owner_id, 'ack_reminder', 'Please acknowledge: ' || t.title, 'Assigned to you and not acknowledged yet.', '/tasks/' || t.id, 'task', t.id);
      end if;
      if public.working_minutes(t.created_at, now()) >= v_day_min and public.once(t.id, 'escalation_ack') then
        for h in select public.heads_of(t.owner_id) loop
          perform public.notify(h, 'escalation_ack', 'Not acknowledged after 1 working day: ' || t.title,
            (select name from public.profiles where id = t.owner_id) || ' has not acknowledged this task.', '/tasks/' || t.id, 'task', t.id);
        end loop;
      end if;
    end if;

    -- 1 day before due.
    if t.due_at > now() and t.due_at <= now() + interval '24 hours' and (t.due_at at time zone 'Asia/Manila')::date > v_today
       and public.once(t.id, 'due_tomorrow', to_char(t.due_at, 'YYYYMMDDHH24MI')) then
      perform public.notify(t.owner_id, 'due_tomorrow', 'Due tomorrow: ' || t.title, 'Due ' || public.fmt_due(t.due_at) || '.', '/tasks/' || t.id, 'task', t.id);
    end if;
    -- 9:00 am on the due date.
    if (t.due_at at time zone 'Asia/Manila')::date = v_today and v_now::time >= time '09:00'
       and public.once(t.id, 'due_today', v_today::text) then
      perform public.notify(t.owner_id, 'due_today', 'Due today: ' || t.title, 'Due ' || public.fmt_due(t.due_at) || '.', '/tasks/' || t.id, 'task', t.id, t.priority = 'urgent');
    end if;
    -- Daily while overdue (from 9:00 am).
    if t.due_at < now() and v_now::time >= time '09:00' and public.once(t.id, 'overdue_daily', v_today::text) then
      perform public.notify(t.owner_id, 'overdue', 'Overdue: ' || t.title, 'Was due ' || public.fmt_due(t.due_at) || '.', '/tasks/' || t.id, 'task', t.id, t.priority = 'urgent');
    end if;
    -- Overdue 2 working days -> Manager; 5 working days -> Leader.
    if t.due_at < now() then
      v_days := public.working_minutes(t.due_at, now()) / greatest(v_day_min, 1);
      if v_days >= 2 and public.once(t.id, 'escalation_overdue2', to_char(t.due_at, 'YYYYMMDDHH24MI')) then
        for h in select public.heads_of(t.owner_id) loop
          perform public.notify(h, 'escalation_overdue', 'Overdue 2 working days: ' || t.title,
            'Owner: ' || (select name from public.profiles where id = t.owner_id) || '.', '/tasks/' || t.id, 'task', t.id);
        end loop;
      end if;
      if v_days >= 5 and public.once(t.id, 'escalation_overdue5', to_char(t.due_at, 'YYYYMMDDHH24MI')) then
        for h in select public.leaders() loop
          perform public.notify(h, 'escalation_overdue', 'Overdue 5 working days: ' || t.title,
            'Owner: ' || (select name from public.profiles where id = t.owner_id) || '.', '/tasks/' || t.id, 'task', t.id);
        end loop;
      end if;
    end if;
    -- Follow-up date for the assigner.
    if t.follow_up_at is not null and t.follow_up_at <= now() and public.once(t.id, 'follow_up', to_char(t.follow_up_at, 'YYYYMMDDHH24MI')) then
      perform public.notify(t.assigned_by, 'follow_up', 'Follow up: ' || t.title, 'Owner: ' || (select name from public.profiles where id = t.owner_id) || '.', '/tasks/' || t.id, 'task', t.id);
    end if;
  end loop;
end;
$$;

-- Access requests not handled within 2 working days (spec 3.5).
create or replace function public.run_access_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare r record; h uuid;
begin
  for r in select * from public.access_requests where status in ('pending', 'sent_back', 'proposed') loop
    if public.working_days_between(coalesce(r.proposed_at, r.created_at), now()) >= 2
       and public.once(r.id, 'access_reminder', r.status::text || coalesce(to_char(r.proposed_at, 'YYYYMMDDHH24MI'), '')) then
      for h in select case when r.status = 'proposed' then public.leaders() else public.hr_users() end loop
        perform public.notify(h, 'access_reminder', 'Access request waiting 2 working days', r.full_name || ' is waiting for access.', '/settings/access', 'access_request', r.id);
      end loop;
    end if;
  end loop;
end;
$$;

-- Daily digest at 8:30 am: my tasks today, overdue, approvals waiting (spec 7).
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
    select count(*) filter (where (due_at at time zone 'Asia/Manila')::date = v_today),
           count(*) filter (where due_at < now())
      into n_today, n_over
      from public.tasks where owner_id = p.id and deleted_at is null and assign_state = 'accepted' and status in ('todo', 'in_progress', 'waiting');
    select (select count(*) from public.tasks where assigned_by = p.id and approval_state = 'pending' and status = 'done' and deleted_at is null)
         + (select count(*) from public.tasks t where t.assign_state = 'requested' and t.deleted_at is null and p.id in (select public.heads_of(t.owner_id)))
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

-- Monday summary to Managers (their team) and Leaders (all) (spec 7).
-- Later steps add issues past target, repeat problems and leave next week.
create or replace function public.run_monday_summary()
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_today date := public.manila_now()::date;
  lines text;
begin
  if extract(isodow from v_today) <> 1 or public.manila_now()::time < (public.setting('digest_time') #>> '{}')::time then return; end if;
  for p in select * from public.profiles where active and access_level in ('leader', 'manager') loop
    if not public.once(p.id, 'monday_summary', v_today::text) then continue; end if;
    select string_agg(o.name || ': ' || o.n || ' overdue', '; ' order by o.n desc) into lines
      from (select pr.name, count(*) n from public.tasks t join public.profiles pr on pr.id = t.owner_id
             where t.deleted_at is null and t.status in ('todo', 'in_progress', 'waiting') and t.due_at < now()
               and (p.access_level = 'leader' or exists (
                    select 1 from public.departments d where d.head_id = p.id and d.id = pr.department_id) or pr.supervisor_id = p.id)
             group by pr.name) o;
    insert into public.notifications (profile_id, kind, title, body, url)
    values (p.id, 'monday_summary', 'Monday summary', coalesce('Overdue by person: ' || lines, 'No overdue tasks. Great start to the week!'), '/team');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delivery: the database asks the app to send push / email / Telegram.
-- ---------------------------------------------------------------------------
create or replace function public.call_app_delivery()
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret text; v_url text;
begin
  select value into v_secret from public.app_secrets where key = 'cron_secret';
  v_url := public.setting('app_url') #>> '{}';
  if v_secret is null or v_url is null then return; end if;
  if not exists (select 1 from public.notifications where delivered_at is null)
     and not exists (select 1 from public.outbound_emails where sent_at is null and error is null) then return; end if;
  perform net.http_post(url := v_url || '/api/cron/deliver', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret), body := '{}'::jsonb);
end;
$$;

-- Emails for access: "Your access is ready" and invites (spec 3.5).
create or replace function public.access_emails()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text := public.setting('app_url') #>> '{}';
begin
  if tg_table_name = 'access_requests' and new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.notify(new.user_id, 'access_ready', 'Your access is ready',
      'Welcome to Office Hub. Sign in at ' || v_url || ' with your work email.', '/today');
  elsif tg_table_name = 'invites' and new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.outbound_emails (to_email, subject, body)
    values (new.email, 'You are invited to iCharge Office Hub / 邀请您使用 iCharge Office Hub',
      'Hi ' || new.full_name || ',' || chr(10) || chr(10) || 'You have access to iCharge Office Hub. Open ' || v_url ||
      ' and sign in with this work email. We will email you a 6-digit code.' || chr(10) || chr(10) ||
      '您已获得 iCharge Office Hub 的使用权限。请打开 ' || v_url || '，用此工作邮箱登录，我们会发送 6 位验证码。');
  end if;
  return new;
end;
$$;
create trigger access_requests_email after update on public.access_requests for each row execute function public.access_emails();
create trigger invites_email after insert or update on public.invites for each row execute function public.access_emails();

-- Telegram linking: the person gets a one-time code, then sends it to the bot.
create or replace function public.telegram_link_code()
returns text language plpgsql security definer set search_path = '' as $$
declare v text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  update public.profiles set telegram_link_code = v where id = (select auth.uid());
  return v;
end;
$$;
revoke execute on function public.telegram_link_code() from public, anon;
grant execute on function public.telegram_link_code() to authenticated;

do $$
declare f text;
begin
  foreach f in array array['setting(text)', 'is_working_day(date)', 'working_minutes(timestamptz, timestamptz)', 'working_days_between(timestamptz, timestamptz)',
                           'once(uuid, text, text)', 'leaders()', 'hr_users()', 'run_task_reminders()', 'run_access_reminders()', 'run_daily_digest()',
                           'run_monday_summary()', 'call_app_delivery()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Schedules (pg_cron, UTC). Every 15 min reminders; every minute delivery.
-- ---------------------------------------------------------------------------
select cron.schedule('oh-task-reminders', '*/15 * * * *', 'select public.run_task_reminders(); select public.run_access_reminders();');
select cron.schedule('oh-digest', '*/10 0-3 * * *', 'select public.run_daily_digest(); select public.run_monday_summary();');
select cron.schedule('oh-deliver', '* * * * *', 'select public.call_app_delivery();');
