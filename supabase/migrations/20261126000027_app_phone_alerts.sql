-- Phone alerts in the Android app (Firebase Cloud Messaging): one row per phone app install.
create table public.fcm_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_key text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index fcm_tokens_profile_idx on public.fcm_tokens (profile_id);
alter table public.fcm_tokens enable row level security;
revoke all on public.fcm_tokens from anon, authenticated;
grant all on public.fcm_tokens to service_role;

insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.2', now(),
'Android app 2.1: phone alerts in the app (turn them on in My profile), smoother sign-in, offline page.
Get it at /download; it updates the app you have.',
'安卓应用 2.1：应用内手机提醒（在“我的资料”中开启）、登录更顺畅、离线页面。
在 /download 下载，可直接更新现有应用。') on conflict (version) do nothing;
