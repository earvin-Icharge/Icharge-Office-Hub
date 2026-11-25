-- Step 12: privacy consent, Trash (30 days), backups reminder, Settings (SPEC.md 10, 11, 12) and Monday summary with leave next week.

insert into public.app_settings (key, value) values
  ('lock_hours', '12'), ('email_code_days', '90'), ('session_days', '30')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Data Privacy Act (RA 10173): notice and consent on first sign-in
-- ---------------------------------------------------------------------------
alter table public.profiles add column privacy_accepted_at timestamptz;
alter table public.access_requests add column privacy_accepted_at timestamptz;
create or replace function public.accept_privacy()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set privacy_accepted_at = now() where id = (select auth.uid()) and privacy_accepted_at is null;
$$;
revoke execute on function public.accept_privacy() from public, anon;
grant execute on function public.accept_privacy() to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (who may change which key, spec 11)
-- ---------------------------------------------------------------------------
create or replace function public.save_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  leader_keys text[] := array['ack_hours', 'work_start', 'work_end', 'work_days', 'quiet_start', 'quiet_end', 'digest_time', 'lock_hours', 'email_code_days',
                              'session_days', 'probation_months', 'iscreen_bd_commission', 'ceo_profile_id', 'cs_anonymize_years', 'app_url'];
  hr_keys text[] := array['work_start', 'work_end', 'work_days', 'location_radius_m', 'selfie_required', 'selfie_days', 'location_days', 'offline_gap_minutes', 'probation_months'];
  cs_keys text[] := array['cs_hours'];
begin
  perform public.require(
    (public.is_leader() and (p_key = any (leader_keys) or p_key = any (hr_keys) or p_key = any (cs_keys)))
    or (public.has_hr() and p_key = any (hr_keys))
    or (public.is_cs_lead() and p_key = any (cs_keys)), 'You cannot change this setting.');
  update public.app_settings set value = p_value, updated_by = (select auth.uid()), updated_at = now() where key = p_key;
  if not found then insert into public.app_settings (key, value, updated_by) values (p_key, p_value, (select auth.uid())); end if;
end;
$$;

create or replace function public.save_department(p_id uuid, p_name text, p_code text, p_head uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader edits departments.');
  if p_id is null then
    insert into public.departments (name, code, head_id) values (trim(p_name), lower(trim(p_code)), p_head);
  else
    update public.departments set name = trim(p_name), head_id = p_head where id = p_id;
  end if;
end;
$$;

create or replace function public.save_email_domain(p_domain text, p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader edits allowed email domains.');
  if p_remove then
    perform public.require((select count(*) from public.allowed_email_domains) > 1, 'Keep at least one domain.');
    delete from public.allowed_email_domains where domain = lower(trim(p_domain));
  else
    insert into public.allowed_email_domains (domain, added_by) values (lower(trim(p_domain)), (select auth.uid())) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.save_shift(p_id uuid, p_name text, p_start time, p_end time, p_days int[], p_grace int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.has_hr() or public.is_leader(), 'Only HR edits shifts.');
  if p_id is null then
    insert into public.shifts (name, start_time, end_time, days, grace_minutes) values (trim(p_name), p_start, p_end, p_days, coalesce(p_grace, 0));
  else
    update public.shifts set name = trim(p_name), start_time = p_start, end_time = p_end, days = p_days, grace_minutes = coalesce(p_grace, 0) where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trash: soft-deleted items stay 30 days; only a Leader restores or deletes permanently (spec 10)
-- ---------------------------------------------------------------------------
create or replace function public.trash_items()
returns table (kind text, id uuid, title text, deleted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require(public.is_leader(), 'Only a Leader opens Trash.');
  return query
    select 'task', t.id, 'T-' || t.ref || ' ' || t.title, t.deleted_at from public.tasks t where t.deleted_at is not null
    union all select 'project', p.id, p.name, p.deleted_at from public.projects p where p.deleted_at is not null
    union all select 'meeting', m.id, m.title, m.deleted_at from public.meetings m where m.deleted_at is not null
    union all select 'issue', i.id, 'ISS-' || i.ref || ' ' || i.title, i.deleted_at from public.issues i where i.deleted_at is not null
    union all select 'client', c.id, c.name, c.deleted_at from public.clients c where c.deleted_at is not null
    union all select 'file', a.id, a.name, a.deleted_at from public.attachments a where a.deleted_at is not null
    order by 4 desc;
end;
$$;

create or replace function public.trash_action(p_kind text, p_id uuid, p_restore boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_table text := case p_kind when 'task' then 'tasks' when 'project' then 'projects' when 'meeting' then 'meetings' when 'issue' then 'issues'
                                    when 'client' then 'clients' when 'file' then 'attachments' end;
begin
  perform public.require(public.is_leader(), 'Only a Leader restores or deletes permanently.');
  perform public.require(v_table is not null, 'Unknown item.');
  if p_restore then
    execute format('update public.%I set deleted_at = null where id = $1 and deleted_at is not null', v_table) using p_id;
  else
    if p_kind = 'task' then delete from public.tasks where recurrence_source_id = p_id and deleted_at is not null; update public.tasks set recurrence_source_id = null where recurrence_source_id = p_id; end if;
    execute format('delete from public.%I where id = $1 and deleted_at is not null', v_table) using p_id;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, new) values ((select auth.uid()), case when p_restore then 'restore' else 'delete_permanently' end, v_table, p_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.run_trash_purge()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set recurrence_source_id = null where recurrence_source_id in (select id from public.tasks where deleted_at < now() - interval '30 days');
  delete from public.tasks where deleted_at < now() - interval '30 days';
  delete from public.meetings where deleted_at < now() - interval '30 days' and not exists (select 1 from public.tasks t where t.meeting_id = meetings.id);
  delete from public.projects where deleted_at < now() - interval '30 days' and not exists (select 1 from public.tasks t where t.project_id = projects.id);
  delete from public.attachments where deleted_at < now() - interval '30 days';
end;
$$;
select cron.schedule('oh-trash-purge', '23 19 * * *', 'select public.run_trash_purge();');

-- Weekly backup reminder to Leaders (Monday 9:00 am Manila).
create or replace function public.run_backup_reminder()
returns void language plpgsql security definer set search_path = '' as $$
declare h uuid;
begin
  for h in select public.leaders() loop
    if public.once(h, 'backup_reminder', public.manila_now()::date::text) then
      perform public.notify(h, 'backup', 'Weekly backup', 'Download this week''s backup of all tables.', '/settings/backup');
    end if;
  end loop;
end;
$$;
select cron.schedule('oh-backup-reminder', '3 1 * * 1', 'select public.run_backup_reminder();');

-- Monday summary: also leave next week (spec 7).
create or replace function public.run_monday_summary()
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_today date := public.manila_now()::date;
  lines text;
  v_issues int;
  v_repeat text;
  v_leave text;
begin
  if extract(isodow from v_today) <> 1 or public.manila_now()::time < (public.setting('digest_time') #>> '{}')::time then return; end if;
  select string_agg(r.loc || ' (' || r.n || ')', ', ') into v_repeat from (
    select coalesce(kiosk_id, location) loc, count(*) n from public.issues
     where deleted_at is null and reported_at > now() - interval '30 days' and coalesce(kiosk_id, location) is not null group by 1 having count(*) >= 3) r;
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
    select string_agg(pr.name || ' ' || to_char(greatest(r.start_date, v_today + 7), 'DD Mon') || '–' || to_char(least(r.end_date, v_today + 13), 'DD Mon'), '; ') into v_leave
      from public.leave_requests r join public.profiles pr on pr.id = r.profile_id
     where r.status = 'approved' and r.start_date <= v_today + 13 and r.end_date >= v_today + 7
       and (p.access_level = 'leader' or exists (select 1 from public.departments d where d.head_id = p.id and d.id = pr.department_id) or pr.supervisor_id = p.id);
    insert into public.notifications (profile_id, kind, title, body, url)
    values (p.id, 'monday_summary', 'Monday summary',
      'Overdue tasks by person: ' || coalesce(lines, 'none') || '.' || chr(10) || 'Issues past target: ' || v_issues || '.' || chr(10) ||
      'Repeat problems (3+ in 30 days): ' || coalesce(v_repeat, 'none') || '.' || chr(10) || 'Leave next week: ' || coalesce(v_leave, 'none') || '.', '/team');
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['save_setting(text, jsonb)', 'save_department(uuid, text, text, uuid)', 'save_email_domain(text, boolean)',
    'save_shift(uuid, text, time without time zone, time without time zone, integer[], integer)', 'trash_items()', 'trash_action(text, uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_trash_purge() from public, anon, authenticated;
revoke execute on function public.run_backup_reminder() from public, anon, authenticated;

-- Everyone (test accounts included) sees the privacy notice once on their next sign-in.
update public.profiles set privacy_accepted_at = null;
