-- Step 1c: devices (quick sign-in), push subscriptions, app releases (SPEC.md 3.5, 3.6).

-- ---------------------------------------------------------------------------
-- Devices: one row per person per browser/phone.
-- Secrets (passkey public key, PIN hash) are written and read only by the server.
-- ---------------------------------------------------------------------------
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  device_key text not null,                      -- random id in an httpOnly cookie on that device
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_name text,
  quick_method text check (quick_method in ('passkey', 'pin', 'both')),
  passkey_credential_id text,
  passkey_public_key text,
  passkey_counter bigint not null default 0,
  pin_hash text,
  failed_pins int not null default 0,
  last_email_code_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  app_version text,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (device_key, profile_id)
);
create index user_devices_profile_idx on public.user_devices (profile_id);

alter table public.user_devices enable row level security;
create policy "devices: own" on public.user_devices
  for select to authenticated using (profile_id = (select auth.uid()));
create policy "devices: hr and leader" on public.user_devices
  for select to authenticated using (public.has_hr() or public.is_leader());
-- Column grants: never the passkey key, credential id or PIN hash.
grant select (id, profile_id, device_name, quick_method, last_email_code_at, last_seen_at, app_version, created_at, removed_at)
  on public.user_devices to authenticated;
grant all on public.user_devices to service_role;

-- ---------------------------------------------------------------------------
-- Push subscriptions (server only)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_key text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
grant all on public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- App releases: version, What's new, minimum version (spec 3.6)
-- ---------------------------------------------------------------------------
create table public.app_releases (
  version text primary key,
  released_at timestamptz not null default now(),
  whats_new_en text not null,
  whats_new_zh text not null,
  min_required boolean not null default false,
  created_by uuid references public.profiles (id)
);
alter table public.app_releases enable row level security;
create policy "releases: active staff read" on public.app_releases
  for select to authenticated using (public.is_active_user());
grant select on public.app_releases to authenticated;
grant all on public.app_releases to service_role;
create trigger app_releases_audit after insert or update or delete on public.app_releases
  for each row execute function public.audit_row();

-- "Ask everyone to update now": the newest release becomes the minimum version. Leader only.
create or replace function public.require_update_now()
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform public.require(public.is_leader(), 'Only a Leader can do this.');
  select version into v from public.app_releases order by released_at desc limit 1;
  perform public.require(v is not null, 'No release yet.');
  update public.app_releases set min_required = true where version = v;
  return v;
end;
$$;
revoke execute on function public.require_update_now() from public, anon;
grant execute on function public.require_update_now() to authenticated;

insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values
  ('0.1.0', '2026-11-25 05:00+00', 'Sign in with your work email and a 6-digit code.
My day, My profile and language switch (English / 简体中文).',
   '使用工作邮箱和 6 位验证码登录。
新增“我的一天”、“我的资料”和语言切换（English / 简体中文）。'),
  ('0.2.0', '2026-11-25 08:00+00', 'New staff request access; HR proposes and a Leader approves.
Invites, access changes and deactivation on the Access page.',
   '新员工可申请权限，人事提议，领导批准。
“权限”页面新增邀请、权限变更和停用。'),
  ('0.3.0', now(), 'Install Office Hub on your phone (Add to Home Screen).
Sign in with your fingerprint, Face ID or a 6-digit PIN.
Phone notifications.
Update button when a new version is ready.',
   '可将 Office Hub 安装到手机（添加到主屏幕）。
可使用指纹、面容 ID 或 6 位 PIN 码登录。
手机通知。
新版本就绪时显示“更新”按钮。');
