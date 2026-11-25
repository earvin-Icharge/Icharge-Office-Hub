-- Step 5: meetings and action items (SPEC.md 4.6).

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 160),
  meeting_at timestamptz not null,
  location text,
  agenda text,
  notes text,
  created_by uuid not null references public.profiles (id),
  notes_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (meeting_id, profile_id)
);
alter table public.tasks add constraint tasks_meeting_id_fkey foreign key (meeting_id) references public.meetings (id);
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();

create or replace function public.in_meeting(p_meeting uuid, p_profile uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meetings m where m.id = p_meeting and m.deleted_at is null
                 and (m.created_by = coalesce(p_profile, (select auth.uid()))
                      or exists (select 1 from public.meeting_attendees a where a.meeting_id = m.id and a.profile_id = coalesce(p_profile, (select auth.uid())))));
$$;

-- Spec 3.3: Leader all; everyone else the meetings they attend or create.
create or replace function public.can_see_meeting(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (public.is_leader() or public.in_meeting(p_meeting));
$$;

create or replace function public.save_meeting(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  a uuid;
begin
  perform public.require(public.is_active_user(), 'Not allowed.');
  perform public.require(nullif(p ->> 'meeting_at', '') is not null, 'Choose the date and time.');
  if v_id is null then
    insert into public.meetings (title, meeting_at, location, agenda, notes, created_by)
    values (trim(p ->> 'title'), (p ->> 'meeting_at')::timestamptz, nullif(trim(coalesce(p ->> 'location', '')), ''),
            nullif(trim(coalesce(p ->> 'agenda', '')), ''), nullif(trim(coalesce(p ->> 'notes', '')), ''), v_me)
    returning id into v_id;
  else
    perform public.require(public.is_leader() or exists (select 1 from public.meetings where id = v_id and created_by = v_me)
                           or public.in_meeting(v_id), 'Only attendees can edit this meeting.');
    update public.meetings set title = trim(p ->> 'title'), meeting_at = (p ->> 'meeting_at')::timestamptz,
           location = nullif(trim(coalesce(p ->> 'location', '')), ''), agenda = nullif(trim(coalesce(p ->> 'agenda', '')), ''),
           notes = nullif(trim(coalesce(p ->> 'notes', '')), '')
     where id = v_id;
  end if;
  if p ? 'attendees' then
    delete from public.meeting_attendees where meeting_id = v_id and profile_id not in (select (jsonb_array_elements_text(p -> 'attendees'))::uuid);
    for a in select (jsonb_array_elements_text(p -> 'attendees'))::uuid loop
      insert into public.meeting_attendees (meeting_id, profile_id) values (v_id, a) on conflict do nothing;
      if found and p_id is null then
        perform public.notify(a, 'meeting_invite', 'Meeting: ' || trim(p ->> 'title'), public.fmt_due((p ->> 'meeting_at')::timestamptz), '/meetings/' || v_id, 'meeting', v_id);
      end if;
    end loop;
  end if;
  return v_id;
end;
$$;

-- One click sends the notes and action list to attendees (email/Telegram through notifications).
create or replace function public.send_meeting_notes(p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m public.meetings;
  v_actions text;
  a uuid;
  n int := 0;
begin
  select * into m from public.meetings where id = p_id and deleted_at is null;
  perform public.require(found and public.can_see_meeting(p_id), 'Meeting not found.');
  select string_agg('• ' || t.title || ' — ' || p.name || ', due ' || public.fmt_due(t.due_at), chr(10) order by t.due_at)
    into v_actions from public.tasks t join public.profiles p on p.id = t.owner_id where t.meeting_id = p_id and t.deleted_at is null;
  for a in select profile_id from public.meeting_attendees where meeting_id = p_id union select m.created_by loop
    if a <> (select auth.uid()) then
      insert into public.notifications (profile_id, kind, title, body, url, entity, entity_id)
      values (a, 'meeting_notes', 'Notes: ' || m.title,
              left(coalesce(m.notes, ''), 1500) || case when v_actions is not null then chr(10) || chr(10) || 'Action items:' || chr(10) || v_actions else '' end,
              '/meetings/' || p_id, 'meeting', p_id);
      n := n + 1;
    end if;
  end loop;
  update public.meetings set notes_sent_at = now() where id = p_id;
  return n;
end;
$$;

create or replace function public.delete_meeting(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.meetings set deleted_at = now() where id = p_id and (created_by = (select auth.uid()) or public.is_leader());
  perform public.require(found, 'Only the person who created it (or a Leader) can delete it.');
end;
$$;

-- Action items: meeting participants may give an action item to another participant.
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

create or replace function public.create_task(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  v_project uuid := nullif(p ->> 'project_id', '')::uuid;
  v_meeting uuid := nullif(p ->> 'meeting_id', '')::uuid;
  v_business public.business;
  v_check text;
  v_id uuid;
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
  if v_meeting is not null and public.in_meeting(v_meeting) and public.in_meeting(v_meeting, v_owner) then
    v_check := 'ok';
  else
    v_check := public.assign_check(v_owner, v_project);
  end if;
  perform public.require(v_check <> 'no', 'You can only assign tasks to yourself or people in your projects.');

  insert into public.tasks (project_id, parent_task_id, title, description, owner_id, assigned_by, due_at, priority, needs_approval,
                            follow_up_at, recurrence_rule, meeting_id, issue_id, business, assign_state, acknowledged_at)
  values (v_project, nullif(p ->> 'parent_task_id', '')::uuid, v_title, nullif(trim(coalesce(p ->> 'description', '')), ''), v_owner, v_me,
          (p ->> 'due_at')::timestamptz, coalesce(nullif(p ->> 'priority', '')::public.task_priority, 'normal'),
          coalesce((p ->> 'needs_approval')::boolean, false), nullif(p ->> 'follow_up_at', '')::timestamptz,
          nullif(p ->> 'recurrence_rule', ''), v_meeting, nullif(p ->> 'issue_id', '')::uuid, v_business,
          case when v_check = 'request' then 'requested' else 'accepted' end,
          case when v_owner = v_me then now() end)
  returning id into v_id;

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

-- Tasks from a meeting are visible to its attendees.
create or replace function public.can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.tasks t where t.id = p_task and t.deleted_at is null and (
      public.is_leader()
      or t.owner_id = (select auth.uid())
      or t.assigned_by = (select auth.uid())
      or public.is_manager_of(t.owner_id)
      or exists (select 1 from public.task_watchers w where w.task_id = t.id and w.profile_id = (select auth.uid()))
      or (t.project_id is not null and public.is_project_member(t.project_id))
      or (t.meeting_id is not null and public.in_meeting(t.meeting_id))));
$$;

alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
create policy "meetings: visible" on public.meetings for select to authenticated using (deleted_at is null and public.can_see_meeting(id));
create policy "meeting_attendees: visible" on public.meeting_attendees for select to authenticated using (public.can_see_meeting(meeting_id));
grant select on public.meetings, public.meeting_attendees to authenticated;
grant all on public.meetings, public.meeting_attendees to service_role;

do $$
declare f text;
begin
  foreach f in array array['save_meeting(uuid, jsonb)', 'send_meeting_notes(uuid)', 'delete_meeting(uuid)', 'can_see_meeting(uuid)', 'in_meeting(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
