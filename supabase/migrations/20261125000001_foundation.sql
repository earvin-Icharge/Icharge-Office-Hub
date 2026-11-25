-- Step 1a: foundation
-- Departments, profiles, business lines, allowed email domains, audit log,
-- sign-in lockout, RLS helper functions and the sign-up email-domain hook.
-- Spec sections 3, 4.1, 10, 13.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.access_level as enum ('boss', 'manager', 'staff');
create type public.business as enum ('icharge', 'iscreen', 'company');
create type public.business_filter as enum ('all', 'icharge', 'iscreen');
create type public.app_language as enum ('en', 'zh-Hans');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- bd, marketing, ops, cs, finance, tech, hr
  name text not null unique,
  head_id uuid,                       -- FK added after profiles exists
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  employee_id text unique,
  name text not null,
  email text not null unique check (email = lower(email)),
  phone text,
  department_id uuid,
  position text,
  supervisor_id uuid,
  access_level public.access_level not null default 'staff',
  hr_access boolean not null default false,
  finance_access boolean not null default false,
  backup_approver_id uuid,
  default_business public.business_filter not null default 'all',
  language public.app_language not null default 'en',
  telegram_chat_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_department_id_fkey foreign key (department_id) references public.departments (id),
  constraint profiles_supervisor_id_fkey foreign key (supervisor_id) references public.profiles (id),
  constraint profiles_backup_approver_id_fkey foreign key (backup_approver_id) references public.profiles (id)
);

alter table public.departments
  add constraint departments_head_id_fkey foreign key (head_id) references public.profiles (id);

create index profiles_department_idx on public.profiles (department_id);
create index profiles_supervisor_idx on public.profiles (supervisor_id);
create index departments_head_idx on public.departments (head_id);

create table public.allowed_email_domains (
  domain text primary key check (domain = lower(domain)),
  added_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
insert into public.allowed_email_domains (domain) values ('icharge.com.ph');

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  subject_profile_id uuid,
  old jsonb,
  new jsonb,
  at timestamptz not null default now()
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_subject_idx on public.audit_log (subject_profile_id);

-- Wrong-code counter for the 5-tries / 15-minute lock (spec 3.5).
-- Used only by the server with the service key: no policies, so the API returns nothing.
create table public.otp_attempts (
  email text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS helper functions (spec 10). SECURITY DEFINER so policies can call them
-- without recursion; all read only the caller's own facts.
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active);
$$;

create or replace function public.is_boss()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.active and p.access_level = 'boss');
$$;

create or replace function public.has_hr()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.active and p.hr_access);
$$;

create or replace function public.has_finance()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.active and p.finance_access);
$$;

-- True when the caller is an active Manager and target_id is in their team:
-- people in a department they head, or people whose supervisor they are (spec 3.2).
create or replace function public.is_manager_of(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_id is not null
     and target_id <> (select auth.uid())
     and exists (select 1 from public.profiles me
                 where me.id = (select auth.uid()) and me.active and me.access_level = 'manager')
     and exists (select 1 from public.profiles t
                 left join public.departments d on d.id = t.department_id
                 where t.id = target_id
                   and (t.supervisor_id = (select auth.uid()) or d.head_id = (select auth.uid())));
$$;

-- True for the caller themself or anyone in the caller's team.
create or replace function public.in_my_team(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_id = (select auth.uid()) or public.is_manager_of(target_id);
$$;

-- True when the caller heads the department with this code (BD head, CS lead, Ops head).
create or replace function public.heads_department(dept_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.departments d
                 join public.profiles p on p.id = d.head_id
                 where d.code = dept_code and d.head_id = (select auth.uid()) and p.active);
$$;

-- ---------------------------------------------------------------------------
-- Audit trigger: who changed what, old -> new (spec 10)
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id text := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_subject uuid;
begin
  if tg_table_name = 'profiles' then
    v_subject := v_id::uuid;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, subject_profile_id, old, new)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_subject, v_old, v_new);
  return coalesce(new, old);
end;
$$;

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function public.audit_row();
create trigger allowed_email_domains_audit after insert or update or delete on public.allowed_email_domains
  for each row execute function public.audit_row();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.allowed_email_domains enable row level security;
alter table public.audit_log enable row level security;
alter table public.otp_attempts enable row level security;

-- Departments: every active employee reads; only the Boss changes.
create policy "departments: active staff read" on public.departments
  for select to authenticated using (public.is_active_user());
create policy "departments: boss insert" on public.departments
  for insert to authenticated with check (public.is_boss());
create policy "departments: boss update" on public.departments
  for update to authenticated using (public.is_boss()) with check (public.is_boss());
create policy "departments: boss delete" on public.departments
  for delete to authenticated using (public.is_boss());

-- Profiles = the employee directory (name, position, department, work email, phone).
-- Everyone active reads the directory; each person can always read their own row.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: active staff read directory" on public.profiles
  for select to authenticated using (public.is_active_user());

-- A person may change only their own language, business switch and Telegram id.
-- Level, HR/Finance access, department, supervisor and active can't be changed
-- through the API at all (step 1b adds the HR-proposes / Boss-approves flow).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (language, default_business, telegram_chat_id) on public.profiles to authenticated;
create policy "profiles: update own preferences" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.is_active_user())
  with check (id = (select auth.uid()));

-- Allowed email domains: Boss only.
create policy "domains: boss read" on public.allowed_email_domains
  for select to authenticated using (public.is_boss());
create policy "domains: boss insert" on public.allowed_email_domains
  for insert to authenticated with check (public.is_boss());
create policy "domains: boss delete" on public.allowed_email_domains
  for delete to authenticated using (public.is_boss());

-- Audit log: Boss sees all; HR sees HR changes. Nobody writes through the API.
create policy "audit: boss read all" on public.audit_log
  for select to authenticated using (public.is_boss());
create policy "audit: hr read hr changes" on public.audit_log
  for select to authenticated using (
    public.has_hr() and table_name in (
      'profiles', 'hr_records', 'hr_private', 'documents', 'attendance',
      'leave_requests', 'leave_balances', 'disciplinary_cases'
    )
  );
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- otp_attempts: RLS on, no policies = no API access.
revoke all on public.otp_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wrong-code counter (server only)
-- ---------------------------------------------------------------------------
create or replace function public.otp_register_failure(p_email text)
returns table (out_failed int, out_locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.otp_attempts as a (email, failed_count, updated_at)
  values (p_email, 1, now())
  on conflict (email) do update
    set failed_count = a.failed_count + 1, updated_at = now();

  update public.otp_attempts a
     set locked_until = now() + interval '15 minutes', failed_count = 0
   where a.email = p_email and a.failed_count >= 5;

  return query
    select a.failed_count, a.locked_until from public.otp_attempts a where a.email = p_email;
end;
$$;
revoke execute on function public.otp_register_failure(text) from public, anon, authenticated;
grant execute on function public.otp_register_failure(text) to service_role;

-- ---------------------------------------------------------------------------
-- Auth hook: refuse any email outside the allowed domains BEFORE the user is
-- created (spec 3.5). Turned on in Supabase: Authentication > Hooks >
-- "Before User Created" -> public.hook_before_user_created.
-- ---------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
  v_domain text := split_part(v_email, '@', 2);
begin
  if v_email = '' or v_domain = ''
     or not exists (select 1 from public.allowed_email_domains d where d.domain = v_domain) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use your iCharge work email.'));
  end if;
  return '{}'::jsonb;
end;
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
