-- Release 1.0.0: the full Office Hub (steps 2–12).
insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.0', now(),
'Tasks, projects, calendar and meetings with reminders and escalation.
Issue log, BD client tracker and customer service cases with KPIs.
HR records, attendance with GPS and selfie, leave, disciplinary records.
Dashboards, performance, reports and Excel export.
Phone, email and Telegram notifications.',
'任务、项目、日历和会议，带提醒和升级。
问题记录、BD 客户跟踪和客服工单及 KPI。
人事档案、带定位和自拍的考勤、请假、纪律记录。
仪表板、绩效、报表和 Excel 导出。
手机、邮件和 Telegram 通知。') on conflict (version) do nothing;
