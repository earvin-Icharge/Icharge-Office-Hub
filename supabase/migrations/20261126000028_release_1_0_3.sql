-- Release 1.0.3: fingerprint sign-in in the Android app (app 2.2).
insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.3', now(),
'Android app 2.2: quick sign-in with your phone''s own fingerprint (My profile › Quick sign-in).
Clearer messages when fingerprint sign-in is not possible.',
'安卓应用 2.2：使用手机自带指纹快捷登录（我的资料 › 快捷登录）。
无法使用指纹登录时，提示更清楚。') on conflict (version) do nothing;
