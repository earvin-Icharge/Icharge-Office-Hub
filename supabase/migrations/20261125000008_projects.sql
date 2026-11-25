-- Step 4: projects (Kanban, list, calendar), milestones, recurring tasks (SPEC.md 4.2, 4.4, 4.5).

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  due_date date not null,
  done_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index milestones_project_idx on public.milestones (project_id);
alter table public.milestones enable row level security;
create policy "milestones: visible" on public.milestones for select to authenticated using (public.can_see_project(project_id));
grant select on public.milestones to authenticated;
grant all on public.milestones to service_role;

create or replace function public.can_edit_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or exists (select 1 from public.projects p where p.id = p_project and p.deleted_at is null
         and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()) or public.is_manager_of(p.owner_id)));
$$;

-- Any active employee may start a project they own; Leaders and Managers may name another owner (Managers: their team).
create or replace function public.save_project(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid := coalesce(nullif(p ->> 'owner_id', '')::uuid, v_me);
  v_id uuid := p_id;
  m uuid;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(v_owner = v_me or public.is_leader() or public.is_manager_of(v_owner), 'You can only make yourself or your team the owner.');
  perform public.require(nullif(p ->> 'business', '') is not null, 'Choose a business: iCharge, iScreen or Company.');
  if v_id is null then
    insert into public.projects (name, business, owner_id, status, priority, description, start_date, due_date, created_by)
    values (trim(p ->> 'name'), (p ->> 'business')::public.business, v_owner, coalesce(nullif(p ->> 'status', ''), 'planning'),
            coalesce(nullif(p ->> 'priority', '')::public.task_priority, 'normal'), nullif(trim(coalesce(p ->> 'description', '')), ''),
            nullif(p ->> 'start_date', '')::date, nullif(p ->> 'due_date', '')::date, v_me)
    returning id into v_id;
  else
    perform public.require(public.can_edit_project(v_id), 'Only the project owner, their Manager or a Leader can edit it.');
    update public.projects set name = trim(p ->> 'name'), business = (p ->> 'business')::public.business, owner_id = v_owner,
           status = coalesce(nullif(p ->> 'status', ''), status), priority = coalesce(nullif(p ->> 'priority', '')::public.task_priority, priority),
           description = nullif(trim(coalesce(p ->> 'description', '')), ''), start_date = nullif(p ->> 'start_date', '')::date,
           due_date = nullif(p ->> 'due_date', '')::date
     where id = v_id;
    delete from public.project_members where project_id = v_id;
    delete from public.project_departments where project_id = v_id;
  end if;
  for m in select (jsonb_array_elements_text(coalesce(p -> 'members', '[]'::jsonb)))::uuid loop
    insert into public.project_members (project_id, profile_id) values (v_id, m) on conflict do nothing;
    if p_id is null then
      perform public.notify(m, 'project_added', 'Added to project: ' || trim(p ->> 'name'), null, '/projects/' || v_id, 'project', v_id);
    end if;
  end loop;
  for m in select (jsonb_array_elements_text(coalesce(p -> 'departments', '[]'::jsonb)))::uuid loop
    insert into public.project_departments (project_id, department_id) values (v_id, m) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;

create or replace function public.set_project_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_project(p_id), 'Only the project owner, their Manager or a Leader can change this.');
  update public.projects set status = p_status where id = p_id;
end;
$$;

create or replace function public.delete_project(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_project(p_id), 'Only the project owner, their Manager or a Leader can delete it.');
  update public.projects set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.save_milestone(p_project uuid, p_title text, p_due date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_project(p_project) or public.is_project_member(p_project), 'Only project members can add milestones.');
  insert into public.milestones (project_id, title, due_date, created_by) values (p_project, trim(p_title), p_due, (select auth.uid()));
end;
$$;

create or replace function public.set_milestone_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.milestones where id = p_id;
  perform public.require(v_project is not null and (public.can_edit_project(v_project) or public.is_project_member(v_project)), 'Not allowed.');
  update public.milestones set done_at = case when p_done then now() end where id = p_id;
end;
$$;

-- Progress = done tasks ÷ all tasks (cancelled not counted).
create or replace function public.project_progress(p_project uuid)
returns table (done int, total int) language sql stable security definer set search_path = '' as $$
  select count(*) filter (where status = 'done')::int, count(*)::int
    from public.tasks where project_id = p_project and deleted_at is null and status <> 'cancelled';
$$;

-- Recurring tasks: when one is done or its due date passes, the next one is created once.
create or replace function public.run_recurring_tasks()
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
  v_next timestamptz;
  v_id uuid;
begin
  for t in
    select * from public.tasks
     where recurrence_rule is not null and deleted_at is null and assign_state = 'accepted'
       and (status = 'done' or due_at < now())
       and not exists (select 1 from public.tasks n where n.recurrence_source_id = tasks.id)
  loop
    v_next := t.due_at + case t.recurrence_rule when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
    while v_next < now() loop
      v_next := v_next + case t.recurrence_rule when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
    end loop;
    insert into public.tasks (project_id, title, description, owner_id, assigned_by, due_at, priority, needs_approval, recurrence_rule,
                              recurrence_source_id, business, acknowledged_at)
    values (t.project_id, t.title, t.description, t.owner_id, t.assigned_by, v_next, t.priority, t.needs_approval, t.recurrence_rule,
            t.id, t.business, case when t.owner_id = t.assigned_by then now() end)
    returning id into v_id;
    insert into public.task_checklist (task_id, text, position) select v_id, text, position from public.task_checklist where task_id = t.id;
    insert into public.task_watchers (task_id, profile_id) select v_id, profile_id from public.task_watchers where task_id = t.id;
    -- the old one stops repeating
    update public.tasks set recurrence_rule = null where id = t.id;
    perform public.notify(t.owner_id, 'task_assigned', 'Repeating task: ' || t.title, 'Due ' || public.fmt_due(v_next) || '.', '/tasks/' || v_id, 'task', v_id);
  end loop;
end;
$$;
-- run_recurring_tasks clears recurrence_rule on the old row; keep the link through recurrence_source_id.
select cron.schedule('oh-recurring', '*/15 * * * *', 'select public.run_recurring_tasks();');

do $$
declare f text;
begin
  foreach f in array array['save_project(uuid, jsonb)', 'set_project_status(uuid, text)', 'delete_project(uuid)', 'save_milestone(uuid, text, date)',
                           'set_milestone_done(uuid, boolean)', 'project_progress(uuid)', 'can_edit_project(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_recurring_tasks() from public, anon, authenticated;
