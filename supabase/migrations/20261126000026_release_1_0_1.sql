-- 1.0.0 notes: no Telegram (removed 25 Nov 2026).
update public.app_releases
   set whats_new_en = replace(whats_new_en, 'Phone, email and Telegram notifications.', 'Phone and email notifications.'),
       whats_new_zh = replace(whats_new_zh, '手机、邮件和 Telegram 通知。', '手机和邮件通知。')
 where version = '1.0.0';

-- Release 1.0.1: phone layout fixes.
insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.1', now(),
'Phone menu (☰ at the top) with every page, your profile and Sign out.
Tidier phone layout: top bar, Team and Audit log as cards, no zooming when you tap a field.
Tick boxes to pick people and departments.',
'手机菜单（顶部 ☰）：所有页面、个人资料和退出登录。
手机版面更整齐：顶栏、团队和审计日志改为卡片，点输入框不再放大。
用勾选框选择人员和部门。') on conflict (version) do nothing;
