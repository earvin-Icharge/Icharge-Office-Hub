-- Release 1.0.5: real month calendar with Philippine holidays and leave; Sign in with Microsoft (ready, off until set up).
insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.5', now(),
'Calendar: a real month view with all Philippine regular holidays and special non-working days (2026–2027), who is on leave, meetings and tasks. Tap a day for details. HR can add or remove a holiday right on the calendar.',
'日历：真正的月视图，显示菲律宾全部法定节假日和特别非工作日（2026–2027）、谁在请假、会议和任务。点日期查看详情。人事可直接在日历上添加或删除节假日。') on conflict (version) do nothing;
