-- Release 1.0.4: incentive leave only, tidier settings, faster taps.
insert into public.app_releases (version, released_at, whats_new_en, whats_new_zh) values ('1.0.4', now(),
'Leave: 5 days of incentive leave a year for everyone (unused days are paid in cash at year end); maternity, paternity and solo parent leave for those who qualify.
Settings: clearer groups with one Save each, day buttons, on/off switches, and an Update now button.
Faster: every tap shows progress at once; pages load quicker.
Long names no longer get cut off on phones.',
'请假：每人每年 5 天服务奖励假（未使用的天数年底折算现金）；符合条件者可申请产假、陪产假和单亲假。
设置：分组更清楚，每组一个保存按钮，星期按钮、开关，以及“立即更新”按钮。
更快：每次点击立即显示进度；页面加载更快。
手机上较长的名称不再被截断。') on conflict (version) do nothing;
