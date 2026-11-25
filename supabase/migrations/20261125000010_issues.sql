-- Step 6a: issue log with targets, timers and escalation (SPEC.md 4.7).

create table public.issue_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  department_id uuid references public.departments (id),          -- owning department
  second_department_id uuid references public.departments (id),   -- e.g. "Ops + Finance"
  default_owner_id uuid references public.profiles (id),
  backup_id uuid references public.profiles (id),
  respond_minutes int not null check (respond_minutes > 0),
  fix_minutes int not null check (fix_minutes > 0),
  is_finance boolean not null default false,                       -- refund / unpaid power bank / venue payout: Finance sees these
  business public.business not null default 'icharge',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.issue_types (name, department_id, second_department_id, respond_minutes, fix_minutes, is_finance, business)
select v.name, d1.id, d2.id, v.respond, v.fix, v.fin, v.biz::public.business
from (values
  ('Kiosk offline, empty or screen down', 'ops', null, 60, 1440, false, 'icharge'),
  ('Customer charged / deposit not refunded', 'ops', 'finance', 60, 4320, true, 'icharge'),
  ('Unpaid or unreturned power bank', 'finance', 'ops', 1440, 10080, true, 'icharge'),
  ('Venue partner issue', 'bd', 'finance', 240, 4320, true, 'icharge'),
  ('App or payment error', 'tech', 'ops', 60, 2880, false, 'icharge'),
  ('iScreen ad issue', 'marketing', 'ops', 240, 1440, false, 'iscreen'),
  ('Advertiser request: proof of play, schedule change', 'marketing', null, 240, 2880, false, 'iscreen')
) v(name, c1, c2, respond, fix, fin, biz)
left join public.departments d1 on d1.code = v.c1
left join public.departments d2 on d2.code = v.c2;

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,
  type_id uuid not null references public.issue_types (id),
  business public.business not null,
  title text not null check (length(trim(title)) between 2 and 200),
  source text not null check (source in ('hotline', 'email', 'viber', 'social', 'partner', 'staff', 'customer_service')),
  location text,
  kiosk_id text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  owner_id uuid references public.profiles (id),
  reported_by uuid not null references public.profiles (id),
  status text not null default 'new' check (status in ('new', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  notes text,
  reported_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  respond_due timestamptz not null,
  fix_due timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index issues_open_idx on public.issues (status) where deleted_at is null;
create index issues_kiosk_idx on public.issues (kiosk_id, reported_at);
create trigger issues_touch before update on public.issues for each row execute function public.touch_updated_at();
create trigger issues_audit after insert or update or delete on public.issues for each row execute function public.audit_row();

-- Amount (₱) lives apart: visible to the Leader, Finance and the owning department only.
create table public.issue_amounts (
  issue_id uuid primary key references public.issues (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.issue_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.issues (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  kind text not null check (kind in ('note', 'status', 'owner', 'system')),
  text text not null,
  at timestamptz not null default now()
);
create index issue_events_issue_idx on public.issue_events (issue_id, at);

alter table public.tasks add constraint tasks_issue_id_fkey foreign key (issue_id) references public.issues (id);

-- ---------------------------------------------------------------------------
-- Who sees what (spec 3.3 "Issue log")
-- ---------------------------------------------------------------------------
create or replace function public.in_issue_department(p_type uuid, p_profile uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.issue_types it join public.profiles p on p.id = coalesce(p_profile, (select auth.uid()))
                 where it.id = p_type and p.department_id in (it.department_id, it.second_department_id));
$$;

create or replace function public.heads_issue_department(p_type uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.issue_types it join public.departments d on d.id in (it.department_id, it.second_department_id)
                 where it.id = p_type and d.head_id = (select auth.uid()));
$$;

create or replace function public.can_see_issue(p_issue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.issues i join public.issue_types it on it.id = i.type_id
     where i.id = p_issue and i.deleted_at is null and (
       public.is_leader()
       or i.reported_by = (select auth.uid()) or i.owner_id = (select auth.uid()) or it.backup_id = (select auth.uid())
       or public.heads_issue_department(it.id)
       or (public.has_hr() and exists (select 1 from public.departments d where d.code = 'hr' and d.id in (it.department_id, it.second_department_id)))
       or (public.has_finance() and it.is_finance)
       or exists (select 1 from public.tasks t where t.issue_id = i.id and t.owner_id = (select auth.uid()) and t.deleted_at is null)));
$$;

create or replace function public.can_see_issue_amount(p_issue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_see_issue(p_issue) and (public.is_leader() or public.has_finance()
         or exists (select 1 from public.issues i where i.id = p_issue and public.in_issue_department(i.type_id)));
$$;

create or replace function public.can_work_issue(p_issue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.issues i join public.issue_types it on it.id = i.type_id
                  where i.id = p_issue and i.deleted_at is null and (
                    public.is_leader() or i.owner_id = (select auth.uid()) or it.backup_id = (select auth.uid())
                    or public.heads_issue_department(it.id)));
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
create or replace function public.report_issue(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  it public.issue_types;
  v_owner uuid;
  v_id uuid;
  v_ref int;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  select * into it from public.issue_types where id = nullif(p ->> 'type_id', '')::uuid and active;
  perform public.require(found, 'Choose the issue type.');
  v_owner := coalesce(nullif(p ->> 'owner_id', '')::uuid, it.default_owner_id,
                      (select head_id from public.departments where id = it.department_id),
                      (select id from public.profiles where active and access_level = 'leader' order by created_at limit 1));
  insert into public.issues (type_id, business, title, source, location, kiosk_id, severity, owner_id, reported_by, notes, respond_due, fix_due)
  values (it.id, it.business, trim(p ->> 'title'), coalesce(nullif(p ->> 'source', ''), 'staff'), nullif(trim(coalesce(p ->> 'location', '')), ''),
          nullif(upper(trim(coalesce(p ->> 'kiosk_id', ''))), ''), coalesce(nullif(p ->> 'severity', ''), 'medium'), v_owner, (select auth.uid()),
          nullif(trim(coalesce(p ->> 'notes', '')), ''), now() + make_interval(mins => it.respond_minutes), now() + make_interval(mins => it.fix_minutes))
  returning id, ref into v_id, v_ref;
  if nullif(p ->> 'amount', '') is not null then
    insert into public.issue_amounts (issue_id, amount, updated_by) values (v_id, (p ->> 'amount')::numeric, (select auth.uid()));
  end if;
  insert into public.issue_events (issue_id, actor_id, kind, text) values (v_id, (select auth.uid()), 'system', 'Reported');
  perform public.notify(v_owner, 'issue_new', 'New issue ISS-' || v_ref || ': ' || trim(p ->> 'title'),
    it.name || case when p ->> 'kiosk_id' <> '' then ' · ' || upper(p ->> 'kiosk_id') else '' end || '. Respond within ' ||
    case when it.respond_minutes < 120 then it.respond_minutes || ' min' when it.respond_minutes < 2880 then (it.respond_minutes / 60) || ' h' else (it.respond_minutes / 1440) || ' days' end || '.',
    '/issues/' || v_id, 'issue', v_id, coalesce(p ->> 'severity', '') = 'critical');
  if it.backup_id is not null and it.backup_id <> v_owner then
    perform public.notify(it.backup_id, 'issue_new', 'New issue ISS-' || v_ref || ' (you are backup)', it.name, '/issues/' || v_id, 'issue', v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.set_issue_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.issues;
begin
  select * into i from public.issues where id = p_id for update;
  perform public.require(found and public.can_work_issue(p_id), 'Only the owner, backup, the team head or a Leader can change this.');
  perform public.require(p_status in ('acknowledged', 'in_progress', 'resolved', 'closed', 'new'), 'Unknown status.');
  perform public.require(p_status <> 'resolved' or length(trim(coalesce(p_note, ''))) > 0, 'Say how it was fixed.');
  update public.issues set status = p_status,
    acknowledged_at = coalesce(acknowledged_at, case when p_status <> 'new' then now() end),
    resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
    closed_at = case when p_status = 'closed' then now() else null end
   where id = p_id;
  insert into public.issue_events (issue_id, actor_id, kind, text)
  values (p_id, (select auth.uid()), 'status', initcap(replace(p_status, '_', ' ')) || coalesce(': ' || nullif(trim(p_note), ''), ''));
  if p_status = 'resolved' then
    perform public.notify(i.reported_by, 'issue_resolved', 'Resolved: ISS-' || i.ref || ' ' || i.title, trim(p_note), '/issues/' || p_id, 'issue', p_id);
  end if;
end;
$$;

create or replace function public.reassign_issue(p_id uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.issues;
begin
  select * into i from public.issues where id = p_id for update;
  perform public.require(found and public.can_work_issue(p_id), 'Only the owner, backup, the team head or a Leader can reassign.');
  perform public.require(exists (select 1 from public.profiles where id = p_owner and active), 'Choose an active person.');
  update public.issues set owner_id = p_owner where id = p_id;
  insert into public.issue_events (issue_id, actor_id, kind, text) values (p_id, (select auth.uid()), 'owner', 'Owner: ' || (select name from public.profiles where id = p_owner));
  perform public.notify(p_owner, 'issue_assigned', 'Issue assigned to you: ISS-' || i.ref || ' ' || i.title, null, '/issues/' || p_id, 'issue', p_id);
end;
$$;

create or replace function public.add_issue_note(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_see_issue(p_id), 'Issue not found.');
  perform public.require(length(trim(coalesce(p_text, ''))) > 0, 'Write a note.');
  insert into public.issue_events (issue_id, actor_id, kind, text) values (p_id, (select auth.uid()), 'note', trim(p_text));
end;
$$;

create or replace function public.set_issue_amount(p_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_see_issue_amount(p_id), 'Not allowed.');
  insert into public.issue_amounts (issue_id, amount, updated_by) values (p_id, p_amount, (select auth.uid()))
  on conflict (issue_id) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now();
  insert into public.issue_events (issue_id, actor_id, kind, text) values (p_id, (select auth.uid()), 'system', 'Amount updated');
end;
$$;

-- Issue types are edited by the Leader (Settings).
create or replace function public.save_issue_type(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform public.require(public.is_leader(), 'Only a Leader can edit issue types.');
  if v_id is null then
    insert into public.issue_types (name, department_id, second_department_id, default_owner_id, backup_id, respond_minutes, fix_minutes, is_finance, business)
    values (trim(p ->> 'name'), nullif(p ->> 'department_id', '')::uuid, nullif(p ->> 'second_department_id', '')::uuid, nullif(p ->> 'default_owner_id', '')::uuid,
            nullif(p ->> 'backup_id', '')::uuid, (p ->> 'respond_minutes')::int, (p ->> 'fix_minutes')::int, coalesce((p ->> 'is_finance')::boolean, false),
            (p ->> 'business')::public.business)
    returning id into v_id;
  else
    update public.issue_types set name = trim(p ->> 'name'), department_id = nullif(p ->> 'department_id', '')::uuid,
      second_department_id = nullif(p ->> 'second_department_id', '')::uuid, default_owner_id = nullif(p ->> 'default_owner_id', '')::uuid,
      backup_id = nullif(p ->> 'backup_id', '')::uuid, respond_minutes = (p ->> 'respond_minutes')::int, fix_minutes = (p ->> 'fix_minutes')::int,
      is_finance = coalesce((p ->> 'is_finance')::boolean, false), business = (p ->> 'business')::public.business,
      active = coalesce((p ->> 'active')::boolean, true)
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_issue(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader can delete issues.');
  update public.issues set deleted_at = now() where id = p_id;
end;
$$;

-- Red timers notify backup and the team head; still open at twice the target -> Leader (spec 4.7).
create or replace function public.run_issue_escalations()
returns void language plpgsql security definer set search_path = '' as $$
declare
  i record;
  h uuid;
begin
  for i in select x.*, it.backup_id, it.department_id, it.second_department_id, it.name as type_name
             from public.issues x join public.issue_types it on it.id = x.type_id
            where x.deleted_at is null and x.status not in ('resolved', 'closed') loop
    if i.acknowledged_at is null and i.respond_due < now() and public.once(i.id, 'issue_respond_missed') then
      for h in select i.backup_id union select d.head_id from public.departments d where d.id in (i.department_id, i.second_department_id) loop
        perform public.notify(h, 'issue_overdue', 'No response yet: ISS-' || i.ref || ' ' || i.title, i.type_name || '. Response target missed.', '/issues/' || i.id, 'issue', i.id, true);
      end loop;
    end if;
    if i.fix_due < now() and public.once(i.id, 'issue_fix_missed') then
      for h in select i.owner_id union select i.backup_id union select d.head_id from public.departments d where d.id in (i.department_id, i.second_department_id) loop
        perform public.notify(h, 'issue_overdue', 'Past fix target: ISS-' || i.ref || ' ' || i.title, i.type_name || '.', '/issues/' || i.id, 'issue', i.id, true);
      end loop;
    end if;
    if i.fix_due + (i.fix_due - i.reported_at) < now() and public.once(i.id, 'issue_leader') then
      for h in select public.leaders() loop
        perform public.notify(h, 'issue_overdue', 'Still open at twice the target: ISS-' || i.ref || ' ' || i.title, i.type_name || '.', '/issues/' || i.id, 'issue', i.id, true);
      end loop;
    end if;
  end loop;
end;
$$;
select cron.schedule('oh-issue-escalations', '*/5 * * * *', 'select public.run_issue_escalations();');

-- Monday summary now also lists issues past target and repeat problems.
create or replace function public.run_monday_summary()
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_today date := public.manila_now()::date;
  lines text;
  v_issues int;
  v_repeat text;
begin
  if extract(isodow from v_today) <> 1 or public.manila_now()::time < (public.setting('digest_time') #>> '{}')::time then return; end if;
  select string_agg(r.loc || ' (' || r.n || ')', ', ') into v_repeat from (
    select coalesce(kiosk_id, location) loc, count(*) n from public.issues
     where deleted_at is null and reported_at > now() - interval '30 days' and coalesce(kiosk_id, location) is not null
     group by 1 having count(*) >= 3) r;
  for p in select * from public.profiles where active and access_level in ('leader', 'manager') loop
    if not public.once(p.id, 'monday_summary', v_today::text) then continue; end if;
    select string_agg(o.name || ': ' || o.n, '; ' order by o.n desc) into lines
      from (select pr.name, count(*) n from public.tasks t join public.profiles pr on pr.id = t.owner_id
             where t.deleted_at is null and t.status in ('todo', 'in_progress', 'waiting') and t.due_at < now()
               and (p.access_level = 'leader' or exists (select 1 from public.departments d where d.head_id = p.id and d.id = pr.department_id) or pr.supervisor_id = p.id)
             group by pr.name) o;
    select count(*) into v_issues from public.issues i join public.issue_types it on it.id = i.type_id
     where i.deleted_at is null and i.status not in ('resolved', 'closed') and i.fix_due < now()
       and (p.access_level = 'leader' or exists (select 1 from public.departments d where d.head_id = p.id and d.id in (it.department_id, it.second_department_id)));
    insert into public.notifications (profile_id, kind, title, body, url)
    values (p.id, 'monday_summary', 'Monday summary',
      'Overdue tasks by person: ' || coalesce(lines, 'none') || '.' || chr(10) ||
      'Issues past target: ' || v_issues || '.' || chr(10) ||
      'Repeat problems (3+ in 30 days): ' || coalesce(v_repeat, 'none') || '.', '/team');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.issue_types enable row level security;
alter table public.issues enable row level security;
alter table public.issue_amounts enable row level security;
alter table public.issue_events enable row level security;
create policy "issue_types: active staff read" on public.issue_types for select to authenticated using (public.is_active_user());
create policy "issues: visible" on public.issues for select to authenticated using (public.can_see_issue(id));
create policy "issue_amounts: visible" on public.issue_amounts for select to authenticated using (public.can_see_issue_amount(issue_id));
create policy "issue_events: visible" on public.issue_events for select to authenticated using (public.can_see_issue(issue_id));
drop policy "attachments: task files" on public.attachments;
create policy "attachments: visible files" on public.attachments for select to authenticated
  using (deleted_at is null and ((entity = 'task' and public.can_see_task(entity_id)) or (entity = 'project' and public.can_see_project(entity_id))
                                 or (entity = 'issue' and public.can_see_issue(entity_id)) or (entity = 'meeting' and public.can_see_meeting(entity_id))));
grant select on public.issue_types, public.issues, public.issue_amounts, public.issue_events to authenticated;
grant all on public.issue_types, public.issues, public.issue_amounts, public.issue_events to service_role;

do $$
declare f text;
begin
  foreach f in array array['report_issue(jsonb)', 'set_issue_status(uuid, text, text)', 'reassign_issue(uuid, uuid)', 'add_issue_note(uuid, text)',
                           'set_issue_amount(uuid, numeric)', 'save_issue_type(uuid, jsonb)', 'delete_issue(uuid)', 'can_see_issue(uuid)',
                           'can_see_issue_amount(uuid)', 'can_work_issue(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_issue_escalations() from public, anon, authenticated;
