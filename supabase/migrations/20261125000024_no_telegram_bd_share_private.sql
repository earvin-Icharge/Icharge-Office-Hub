-- Owner decisions (25 Nov 2026):
-- 1. No Telegram: notifications are in-app, phone push and email only.
-- 2. The BD person's commission (BD share) is visible only to that BD person (their own clients) and Leaders.
--    Not to the BD head, Finance or anyone else. A rate outside the commission plan needs a Leader's approval.

-- ---------------------------------------------------------------------------
-- 1. Remove Telegram
-- ---------------------------------------------------------------------------
drop function if exists public.telegram_link_code();
alter table public.profiles drop column if exists notify_telegram, drop column if exists telegram_link_code, drop column if exists telegram_chat_id;

-- ---------------------------------------------------------------------------
-- 2. BD share: the BD person (client owner) and Leaders only
-- ---------------------------------------------------------------------------
create or replace function public.can_see_bd_share(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (public.is_leader()
    or exists (select 1 from public.clients c where c.id = p_client and c.owner_id = (select auth.uid()) and c.deleted_at is null));
$$;
revoke execute on function public.can_see_bd_share(uuid) from public, anon;
grant execute on function public.can_see_bd_share(uuid) to authenticated;

drop policy "client_terms: visible" on public.client_terms;
create policy "client_terms: client terms" on public.client_terms for select to authenticated
  using (kind <> 'bd_share' and public.can_see_client(client_id));
create policy "client_terms: bd share" on public.client_terms for select to authenticated
  using (kind = 'bd_share' and public.can_see_bd_share(client_id));

-- The plan rate is part of the commission: same rule.
create or replace function public.bd_plan_rate(p_client uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when not public.can_see_bd_share(p_client) then null
    when c.business = 'iscreen' then (public.setting('iscreen_bd_commission') #>> '{}')::numeric
    when c.is_key_account then 10
    when (select count(*) from public.client_kiosks k where k.client_id = c.id) >= 10 then 5
    when (select count(*) from public.client_kiosks k where k.client_id = c.id) >= 1 then 2
    else null end
  from public.clients c where c.id = p_client;
$$;

-- The iScreen commission setting: Leaders only.
drop policy "settings: active staff read" on public.app_settings;
create policy "settings: active staff read" on public.app_settings for select to authenticated
  using (public.is_active_user() and (key <> 'iscreen_bd_commission' or public.is_leader()));

create or replace function public.set_client_term(p_client uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p ->> 'kind';
  v_value numeric := (p ->> 'value')::numeric;
  v_plan numeric;
  v_has_prev boolean;
  v_id uuid;
  h uuid;
  v_name text;
begin
  perform public.require(public.can_edit_client(p_client), 'Only the client owner, the BD head or a Leader can change terms.');
  -- BD share: only the BD person who owns the client, or a Leader.
  perform public.require(v_kind <> 'bd_share' or public.can_see_bd_share(p_client), 'Only the BD person and a Leader can set the BD share.');
  select exists (select 1 from public.client_terms where client_id = p_client and kind = v_kind and status = 'active') into v_has_prev;
  perform public.require(not v_has_prev or length(trim(coalesce(p ->> 'reason', ''))) >= 3, 'Say why the term changes.');
  insert into public.client_terms (client_id, kind, value, unit, basis, payout_timing, term_text, status, set_by, reason)
  values (p_client, v_kind, v_value, coalesce(nullif(p ->> 'unit', ''), 'percent'), nullif(p ->> 'basis', ''), nullif(trim(coalesce(p ->> 'payout_timing', '')), ''),
          nullif(trim(coalesce(p ->> 'term_text', '')), ''), 'pending', (select auth.uid()), nullif(trim(coalesce(p ->> 'reason', '')), ''))
  returning id into v_id;
  if v_kind = 'bd_share' and not public.is_leader() then
    v_plan := public.bd_plan_rate(p_client);
    if v_plan is null or v_value <> v_plan then
      -- A rate outside the commission plan needs a Leader (notification without the rate).
      select name into v_name from public.clients where id = p_client;
      for h in select public.leaders() loop
        perform public.notify(h, 'client_term_approval', 'BD share needs approval: ' || v_name, 'A rate outside the commission plan was proposed.', '/clients/' || p_client, 'client', p_client);
      end loop;
      return v_id;
    end if;
  end if;
  perform public.activate_client_term(v_id);
  return v_id;
end;
$$;

create or replace function public.decide_client_term(p_term uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.client_terms;
begin
  select * into t from public.client_terms where id = p_term for update;
  perform public.require(found and t.status = 'pending', 'This term is not waiting for approval.');
  perform public.require(public.is_leader(), 'Only a Leader approves BD shares.');
  perform public.require(t.set_by <> (select auth.uid()), 'You cannot approve your own proposal.');
  if p_approve then
    update public.client_terms set approved_leader_by = (select auth.uid()) where id = p_term;
    perform public.activate_client_term(p_term);
  else
    update public.client_terms set status = 'rejected', valid_to = current_date where id = p_term;
  end if;
  perform public.notify(t.set_by, 'client_term_decided', case when p_approve then 'BD share approved' else 'BD share not approved' end, null, '/clients/' || t.client_id, 'client', t.client_id);
end;
$$;
