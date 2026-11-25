-- Step 2: tasks (SPEC.md 4.2, 4.3), plus the base tables later steps build on:
-- projects (extended in step 4), notifications (delivered in step 3), attachments.

create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- Projects (base; step 4 adds milestones, views and more)
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  business public.business not null,
  owner_id uuid not null references public.profiles (id),
  status text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  priority public.task_priority not null default 'normal',
  description text,
  start_date date,
  due_date date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (project_id, profile_id)
);
create table public.project_departments (
  project_id uuid not null references public.projects (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  primary key (project_id, department_id)
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,                                   -- short number shown as T-123
  project_id uuid references public.projects (id),
  parent_task_id uuid references public.tasks (id),
  title text not null check (length(trim(title)) between 2 and 200),
  description text,
  owner_id uuid not null references public.profiles (id),
  assigned_by uuid not null references public.profiles (id),
  due_at timestamptz not null,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  waiting_on text,
  needs_approval boolean not null default false,
  approval_state text not null default 'none' check (approval_state in ('none', 'pending', 'accepted')),
  reopen_count int not null default 0,
  assign_state text not null default 'accepted' check (assign_state in ('accepted', 'requested', 'declined')),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  follow_up_at timestamptz,
  recurrence_rule text check (recurrence_rule in ('daily', 'weekly', 'monthly')),
  recurrence_source_id uuid references public.tasks (id),
  meeting_id uuid,
  issue_id uuid,
  business public.business not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'waiting' or length(trim(coalesce(waiting_on, ''))) > 0),
  check (status <> 'done' or length(trim(coalesce(completion_note, ''))) > 0)
);
create index tasks_owner_idx on public.tasks (owner_id) where deleted_at is null;
create index tasks_assigned_by_idx on public.tasks (assigned_by) where deleted_at is null;
create index tasks_project_idx on public.tasks (project_id);
create index tasks_due_idx on public.tasks (due_at) where deleted_at is null and status not in ('done', 'cancelled');

create table public.task_watchers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, profile_id)
);
create table public.task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position int not null default 0,
  done_by uuid references public.profiles (id),
  done_at timestamptz
);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(trim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid,
  field text not null,
  old_value text,
  new_value text,
  at timestamptz not null default now()
);
create index task_history_task_idx on public.task_history (task_id, at);

-- Files for tasks, projects, issues, cases … (private bucket "attachments", signed links only)
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('task', 'project', 'issue', 'meeting', 'client', 'cs_case', 'discipline', 'document')),
  entity_id uuid not null,
  path text not null unique,
  name text not null,
  size_bytes int not null,
  mime text,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index attachments_entity_idx on public.attachments (entity, entity_id);

-- In-app notifications (step 3 adds email, push and Telegram delivery)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text,
  entity text,
  entity_id uuid,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  delivered_at timestamptz
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index notifications_undelivered_idx on public.notifications (created_at) where delivered_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_profile uuid, p_kind text, p_title text, p_body text, p_url text, p_entity text default null, p_entity_id uuid default null, p_urgent boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, kind, title, body, url, entity, entity_id, urgent)
  select p_profile, p_kind, p_title, p_body, p_url, p_entity, p_entity_id, p_urgent
  where p_profile is not null and p_profile <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid);
$$;
revoke execute on function public.notify(uuid, text, text, text, text, text, uuid, boolean) from public, anon, authenticated;

create or replace function public.is_project_member(p_project uuid, p_profile uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects pr where pr.id = p_project and pr.deleted_at is null
                 and (pr.owner_id = coalesce(p_profile, (select auth.uid()))
                      or exists (select 1 from public.project_members m where m.project_id = pr.id and m.profile_id = coalesce(p_profile, (select auth.uid())))));
$$;

create or replace function public.can_see_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.is_leader()
    or public.is_project_member(p_project)
    or exists (select 1 from public.projects pr where pr.id = p_project and public.is_manager_of(pr.owner_id))
    or exists (select 1 from public.project_departments pd join public.departments d on d.id = pd.department_id
               where pd.project_id = p_project and d.head_id = (select auth.uid())));
$$;

-- Spec 3.3 "See tasks and projects".
create or replace function public.can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.tasks t where t.id = p_task and t.deleted_at is null and (
      public.is_leader()
      or t.owner_id = (select auth.uid())
      or t.assigned_by = (select auth.uid())
      or public.is_manager_of(t.owner_id)
      or exists (select 1 from public.task_watchers w where w.task_id = t.id and w.profile_id = (select auth.uid()))
      or (t.project_id is not null and public.is_project_member(t.project_id))));
$$;

-- Spec 3.3 "Assign tasks": 'ok', 'request' (cross-team: the other head must accept) or 'no'.
create or replace function public.assign_check(p_owner uuid, p_project uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if not public.is_active_user() then return 'no'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_owner and p.active) then return 'no'; end if;
  if public.is_leader() or p_owner = v_me then return 'ok'; end if;
  if p_project is not null and public.is_project_member(p_project) and public.is_project_member(p_project, p_owner) then return 'ok'; end if;
  if exists (select 1 from public.profiles p where p.id = v_me and p.access_level = 'manager') then
    return case when public.is_manager_of(p_owner) then 'ok' else 'request' end;
  end if;
  return 'no';
end;
$$;

-- People who head the owner's team (supervisor and department head): they accept cross-team requests.
create or replace function public.heads_of(p_profile uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.supervisor_id from public.profiles p where p.id = p_profile and p.supervisor_id is not null
  union
  select d.head_id from public.profiles p join public.departments d on d.id = p.department_id where p.id = p_profile and d.head_id is not null;
$$;

create or replace function public.fmt_due(p timestamptz)
returns text language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'Asia/Manila', 'DD Mon, HH12:MI am');
$$;

-- ---------------------------------------------------------------------------
-- History trigger: every change is kept (who, what, when)
-- ---------------------------------------------------------------------------
create or replace function public.task_history_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  f text;
  o text;
  n text;
  fields text[] := array['title', 'description', 'owner_id', 'due_at', 'priority', 'status', 'waiting_on', 'needs_approval',
                         'approval_state', 'assign_state', 'acknowledged_at', 'completion_note', 'follow_up_at', 'project_id',
                         'recurrence_rule', 'business', 'deleted_at'];
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, actor_id, field, new_value) values (new.id, (select auth.uid()), 'created', new.title);
    return new;
  end if;
  foreach f in array fields loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f) into o, n using old, new;
    if o is distinct from n then
      insert into public.task_history (task_id, actor_id, field, old_value, new_value) values (new.id, (select auth.uid()), f, o, n);
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
create trigger tasks_history_insert after insert on public.tasks for each row execute function public.task_history_row();
create trigger tasks_history_update before update on public.tasks for each row execute function public.task_history_row();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger projects_audit after insert or update or delete on public.projects for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Task actions (all rules here)
-- ---------------------------------------------------------------------------
create or replace function public.create_task(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  v_project uuid := nullif(p ->> 'project_id', '')::uuid;
  v_business public.business;
  v_check text;
  v_id uuid;
  v_ref int;
  v_line text;
  v_pos int := 0;
  w uuid;
  h uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(v_owner is not null, 'A task needs one owner.');
  perform public.require(nullif(p ->> 'due_at', '') is not null, 'A task needs a due date.');
  perform public.require(length(v_title) >= 2, 'Give the task a title.');
  if v_project is not null then
    perform public.require(public.can_see_project(v_project), 'Project not found.');
    select business into v_business from public.projects where id = v_project;
  else
    v_business := nullif(p ->> 'business', '')::public.business;
  end if;
  perform public.require(v_business is not null, 'Choose a business: iCharge, iScreen or Company.');
  v_check := public.assign_check(v_owner, v_project);
  perform public.require(v_check <> 'no', 'You can only assign tasks to yourself or people in your projects.');

  insert into public.tasks (project_id, parent_task_id, title, description, owner_id, assigned_by, due_at, priority, needs_approval,
                            follow_up_at, recurrence_rule, meeting_id, issue_id, business, assign_state, acknowledged_at)
  values (v_project, nullif(p ->> 'parent_task_id', '')::uuid, v_title, nullif(trim(coalesce(p ->> 'description', '')), ''), v_owner, v_me,
          (p ->> 'due_at')::timestamptz, coalesce(nullif(p ->> 'priority', '')::public.task_priority, 'normal'),
          coalesce((p ->> 'needs_approval')::boolean, false), nullif(p ->> 'follow_up_at', '')::timestamptz,
          nullif(p ->> 'recurrence_rule', ''), nullif(p ->> 'meeting_id', '')::uuid, nullif(p ->> 'issue_id', '')::uuid, v_business,
          case when v_check = 'request' then 'requested' else 'accepted' end,
          case when v_owner = v_me then now() end)
  returning id, ref into v_id, v_ref;

  for w in select (jsonb_array_elements_text(coalesce(p -> 'watchers', '[]'::jsonb)))::uuid loop
    insert into public.task_watchers (task_id, profile_id) values (v_id, w) on conflict do nothing;
  end loop;
  for v_line in select trim(x) from jsonb_array_elements_text(coalesce(p -> 'checklist', '[]'::jsonb)) x loop
    if v_line <> '' then
      v_pos := v_pos + 1;
      insert into public.task_checklist (task_id, text, position) values (v_id, v_line, v_pos);
    end if;
  end loop;

  if v_check = 'request' then
    for h in select public.heads_of(v_owner) loop
      perform public.notify(h, 'task_request', 'Task request for your team', v_title, '/tasks/' || v_id, 'task', v_id);
    end loop;
  else
    perform public.notify(v_owner, 'task_assigned', 'New task: ' || v_title, 'Due ' || public.fmt_due((p ->> 'due_at')::timestamptz) || '. Please acknowledge.',
                          '/tasks/' || v_id, 'task', v_id, coalesce(p ->> 'priority', '') = 'urgent');
  end if;
  return v_id;
end;
$$;

-- Edit details (assigner or Leader). Reassigning keeps the history and notifies both people.
create or replace function public.update_task(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  t public.tasks;
  v_owner uuid;
  v_check text;
begin
  select * into t from public.tasks where id = p_id and deleted_at is null for update;
  perform public.require(found and public.can_see_task(p_id), 'Task not found.');
  perform public.require(t.assigned_by = v_me or public.is_leader() or (t.owner_id = v_me and t.assigned_by = v_me), 'Only the person who assigned it (or a Leader) can edit this task.');
  v_owner := coalesce(nullif(p ->> 'owner_id', '')::uuid, t.owner_id);
  if v_owner <> t.owner_id then
    v_check := public.assign_check(v_owner, t.project_id);
    perform public.require(v_check <> 'no', 'You cannot assign this task to that person.');
  end if;
  update public.tasks set
    title = coalesce(nullif(trim(p ->> 'title'), ''), title),
    description = case when p ? 'description' then nullif(trim(p ->> 'description'), '') else description end,
    due_at = coalesce(nullif(p ->> 'due_at', '')::timestamptz, due_at),
    priority = coalesce(nullif(p ->> 'priority', '')::public.task_priority, priority),
    needs_approval = coalesce((p ->> 'needs_approval')::boolean, needs_approval),
    follow_up_at = case when p ? 'follow_up_at' then nullif(p ->> 'follow_up_at', '')::timestamptz else follow_up_at end,
    recurrence_rule = case when p ? 'recurrence_rule' then nullif(p ->> 'recurrence_rule', '') else recurrence_rule end,
    owner_id = v_owner,
    acknowledged_at = case when v_owner <> t.owner_id then (case when v_owner = v_me then now() end) else acknowledged_at end,
    assign_state = case when v_owner <> t.owner_id then (case when v_check = 'request' then 'requested' else 'accepted' end) else assign_state end
  where id = p_id;
  if v_owner <> t.owner_id then
    perform public.notify(v_owner, 'task_assigned', 'Task reassigned to you: ' || t.title, 'Please acknowledge.', '/tasks/' || p_id, 'task', p_id);
    perform public.notify(t.owner_id, 'task_reassigned', 'Task moved to someone else: ' || t.title, null, '/tasks/' || p_id, 'task', p_id);
  end if;
end;
$$;

create or replace function public.acknowledge_task(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set acknowledged_at = now()
   where id = p_id and owner_id = (select auth.uid()) and acknowledged_at is null and deleted_at is null and assign_state = 'accepted';
  perform public.require(found, 'Only the task owner can acknowledge it.');
end;
$$;

create or replace function public.set_task_status(p_id uuid, p_status public.task_status, p_note text default null, p_waiting_on text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  t public.tasks;
begin
  select * into t from public.tasks where id = p_id and deleted_at is null for update;
  perform public.require(found and public.can_see_task(p_id), 'Task not found.');
  perform public.require(t.assign_state = 'accepted', 'This task is waiting for the team head to accept it.');
  if p_status = 'cancelled' then
    perform public.require(t.assigned_by = v_me or public.is_leader(), 'Only the person who assigned it can cancel it.');
  else
    perform public.require(t.owner_id = v_me or t.assigned_by = v_me or public.is_leader(), 'Only the owner can change the status.');
  end if;
  perform public.require(p_status <> 'waiting' or length(trim(coalesce(p_waiting_on, ''))) > 0, 'Say who or what you are waiting on.');
  perform public.require(p_status <> 'done' or length(trim(coalesce(p_note, ''))) > 0, 'Add a short completion note.');
  update public.tasks set
    status = p_status,
    waiting_on = case when p_status = 'waiting' then trim(p_waiting_on) else null end,
    completion_note = case when p_status = 'done' then trim(p_note) else completion_note end,
    completed_at = case when p_status = 'done' then now() else null end,
    approval_state = case when p_status = 'done' and t.needs_approval then 'pending' when p_status = 'done' then 'none' else approval_state end,
    acknowledged_at = coalesce(acknowledged_at, case when t.owner_id = v_me then now() end)
  where id = p_id;
  if p_status = 'done' then
    perform public.notify(t.assigned_by, case when t.needs_approval then 'task_review' else 'task_done' end,
      case when t.needs_approval then 'Please review: ' else 'Done: ' end || t.title, trim(p_note), '/tasks/' || p_id, 'task', p_id);
  elsif p_status = 'cancelled' then
    perform public.notify(t.owner_id, 'task_cancelled', 'Cancelled: ' || t.title, null, '/tasks/' || p_id, 'task', p_id);
  end if;
end;
$$;

-- Needs approval: the assigner accepts, or reopens with a reason.
create or replace function public.review_task(p_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id and deleted_at is null for update;
  perform public.require(found, 'Task not found.');
  perform public.require(t.assigned_by = (select auth.uid()) or public.is_leader(), 'Only the person who assigned it can review it.');
  perform public.require(t.status = 'done' and t.approval_state = 'pending', 'This task is not waiting for review.');
  if p_accept then
    update public.tasks set approval_state = 'accepted' where id = p_id;
    perform public.notify(t.owner_id, 'task_accepted', 'Accepted: ' || t.title, null, '/tasks/' || p_id, 'task', p_id);
  else
    perform public.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Give a reason for reopening.');
    update public.tasks set status = 'in_progress', approval_state = 'none', completed_at = null, reopen_count = reopen_count + 1 where id = p_id;
    insert into public.task_comments (task_id, author_id, body) values (p_id, (select auth.uid()), 'Reopened: ' || trim(p_reason));
    perform public.notify(t.owner_id, 'task_reopened', 'Reopened: ' || t.title, trim(p_reason), '/tasks/' || p_id, 'task', p_id);
  end if;
end;
$$;

-- Cross-team request: the owner's team head accepts or declines.
create or replace function public.decide_task_request(p_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id and deleted_at is null for update;
  perform public.require(found and t.assign_state = 'requested', 'This task is not waiting for a decision.');
  perform public.require(public.is_leader() or (select auth.uid()) in (select public.heads_of(t.owner_id)), 'Only the person''s team head can decide.');
  update public.tasks set assign_state = case when p_accept then 'accepted' else 'declined' end,
         status = case when p_accept then status else 'cancelled' end
   where id = p_id;
  if p_accept then
    perform public.notify(t.owner_id, 'task_assigned', 'New task: ' || t.title, 'Due ' || public.fmt_due(t.due_at) || '. Please acknowledge.', '/tasks/' || p_id, 'task', p_id);
  end if;
  perform public.notify(t.assigned_by, 'task_request_decided', case when p_accept then 'Request accepted: ' else 'Request declined: ' end || t.title,
                        nullif(trim(coalesce(p_reason, '')), ''), '/tasks/' || p_id, 'task', p_id);
end;
$$;

create or replace function public.add_task_comment(p_id uuid, p_body text, p_mentions uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tasks;
  m uuid;
begin
  select * into t from public.tasks where id = p_id and deleted_at is null;
  perform public.require(found and public.can_see_task(p_id), 'Task not found.');
  insert into public.task_comments (task_id, author_id, body, mentions) values (p_id, (select auth.uid()), trim(p_body), coalesce(p_mentions, '{}'));
  foreach m in array coalesce(p_mentions, '{}') loop
    insert into public.task_watchers (task_id, profile_id) values (p_id, m) on conflict do nothing;
    perform public.notify(m, 'mention', 'You were mentioned: ' || t.title, left(trim(p_body), 140), '/tasks/' || p_id, 'task', p_id);
  end loop;
  if not (t.owner_id = any (coalesce(p_mentions, '{}'))) then
    perform public.notify(t.owner_id, 'task_comment', 'New comment: ' || t.title, left(trim(p_body), 140), '/tasks/' || p_id, 'task', p_id);
  end if;
  if t.assigned_by <> t.owner_id and not (t.assigned_by = any (coalesce(p_mentions, '{}'))) then
    perform public.notify(t.assigned_by, 'task_comment', 'New comment: ' || t.title, left(trim(p_body), 140), '/tasks/' || p_id, 'task', p_id);
  end if;
end;
$$;

create or replace function public.set_checklist_item(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_task uuid;
begin
  select task_id into v_task from public.task_checklist where id = p_item;
  perform public.require(v_task is not null and public.can_see_task(v_task), 'Item not found.');
  update public.task_checklist set done = p_done, done_by = case when p_done then (select auth.uid()) end, done_at = case when p_done then now() end where id = p_item;
end;
$$;

create or replace function public.add_checklist_item(p_task uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_see_task(p_task), 'Task not found.');
  perform public.require(length(trim(coalesce(p_text, ''))) > 0, 'Type the item.');
  insert into public.task_checklist (task_id, text, position)
  values (p_task, trim(p_text), coalesce((select max(position) + 1 from public.task_checklist where task_id = p_task), 1));
end;
$$;

create or replace function public.set_task_watcher(p_task uuid, p_profile uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_see_task(p_task), 'Task not found.');
  if p_on then
    insert into public.task_watchers (task_id, profile_id) values (p_task, p_profile) on conflict do nothing;
  else
    delete from public.task_watchers where task_id = p_task and profile_id = p_profile;
  end if;
end;
$$;

-- Soft delete: to Trash for 30 days (spec 10). Assigner or Leader.
create or replace function public.delete_task(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set deleted_at = now()
   where id = p_id and deleted_at is null and (assigned_by = (select auth.uid()) or public.is_leader());
  perform public.require(found, 'Only the person who assigned it (or a Leader) can delete it.');
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where profile_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_departments enable row level security;
alter table public.tasks enable row level security;
alter table public.task_watchers enable row level security;
alter table public.task_checklist enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_history enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;

create policy "projects: visible" on public.projects for select to authenticated using (deleted_at is null and public.can_see_project(id));
create policy "project_members: visible" on public.project_members for select to authenticated using (public.can_see_project(project_id));
create policy "project_departments: visible" on public.project_departments for select to authenticated using (public.can_see_project(project_id));
create policy "tasks: visible" on public.tasks for select to authenticated using (public.can_see_task(id));
create policy "task_watchers: visible" on public.task_watchers for select to authenticated using (public.can_see_task(task_id));
create policy "task_checklist: visible" on public.task_checklist for select to authenticated using (public.can_see_task(task_id));
create policy "task_comments: visible" on public.task_comments for select to authenticated using (public.can_see_task(task_id));
create policy "task_history: visible" on public.task_history for select to authenticated using (public.can_see_task(task_id));
create policy "attachments: task files" on public.attachments for select to authenticated
  using (deleted_at is null and ((entity = 'task' and public.can_see_task(entity_id)) or (entity = 'project' and public.can_see_project(entity_id))));
create policy "notifications: own" on public.notifications for select to authenticated using (profile_id = (select auth.uid()));

grant select on public.projects, public.project_members, public.project_departments, public.tasks, public.task_watchers,
  public.task_checklist, public.task_comments, public.task_history, public.attachments, public.notifications to authenticated;
grant all on public.projects, public.project_members, public.project_departments, public.tasks, public.task_watchers,
  public.task_checklist, public.task_comments, public.task_history, public.attachments, public.notifications to service_role;
grant usage, select on all sequences in schema public to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'create_task(jsonb)', 'update_task(uuid, jsonb)', 'acknowledge_task(uuid)', 'set_task_status(uuid, public.task_status, text, text)',
    'review_task(uuid, boolean, text)', 'decide_task_request(uuid, boolean, text)', 'add_task_comment(uuid, text, uuid[])',
    'set_checklist_item(uuid, boolean)', 'add_checklist_item(uuid, text)', 'set_task_watcher(uuid, uuid, boolean)', 'delete_task(uuid)',
    'mark_notifications_read(uuid[])', 'assign_check(uuid, uuid)', 'can_see_task(uuid)', 'can_see_project(uuid)', 'is_project_member(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.heads_of(uuid) from public, anon, authenticated;

-- Private storage bucket for attachments (opened only through short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520)
on conflict (id) do nothing;
