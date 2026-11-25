-- Step 6b: BD client tracker (SPEC.md 4.8).

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  type text not null check (type in ('mall', 'hospital', 'resort', 'sme', 'transport', 'advertiser', 'other')),
  business public.business not null check (business in ('icharge', 'iscreen')),
  owner_id uuid not null references public.profiles (id),
  contact_name text,
  contact_phone text,
  status text not null default 'prospect' check (status in ('prospect', 'proposal_sent', 'negotiating', 'waiting_signature', 'active', 'renewal_talks', 'renewed', 'ended')),
  is_key_account boolean not null default false,       -- key or multi-branch account (BD plan 10 %)
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger clients_audit after insert or update or delete on public.clients for each row execute function public.audit_row();

create table public.client_kiosks (
  client_id uuid not null references public.clients (id) on delete cascade,
  kiosk_id text not null,
  primary key (client_id, kiosk_id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  auto_renew boolean not null default false,
  notice_days int,
  special_terms text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index contracts_client_idx on public.contracts (client_id, end_date desc);
create trigger contracts_audit after insert or update or delete on public.contracts for each row execute function public.audit_row();

-- Agreed terms. Never overwritten: a change adds a row and closes the old one (spec 4.8 "History is never lost").
create table public.client_terms (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('venue_share', 'client_price', 'bd_share')),
  value numeric(12, 2) not null check (value >= 0),
  unit text not null check (unit in ('percent', 'php_per_kiosk_month', 'php_package')),
  basis text check (basis in ('gross_rental_sales', 'gross_operating_profit', 'ad_contract_first_3_months')),
  payout_timing text,
  term_text text,
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'active' check (status in ('active', 'pending', 'superseded', 'rejected')),
  set_by uuid not null references public.profiles (id),
  reason text,
  approved_bd_head_by uuid references public.profiles (id),
  approved_leader_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index client_terms_client_idx on public.client_terms (client_id, kind, created_at desc);
create trigger client_terms_audit after insert or update or delete on public.client_terms for each row execute function public.audit_row();

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  noted_on date not null default current_date,
  text text not null check (length(trim(text)) between 1 and 4000),
  tag text check (tag in ('asked', 'offered', 'agreed', 'changed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table public.kiosk_usage_monthly (
  kiosk_id text not null,
  month date not null check (extract(day from month) = 1),
  rentals int not null check (rentals >= 0),
  sales numeric(14, 2) not null default 0,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  primary key (kiosk_id, month)
);

insert into public.app_settings (key, value) values ('iscreen_bd_commission', 'null') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Access (spec 3.3 "Client tracker")
-- ---------------------------------------------------------------------------
create or replace function public.is_bd_head()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.heads_department('bd');
$$;

create or replace function public.can_see_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists (
    select 1 from public.clients c join public.profiles o on o.id = c.owner_id
     where c.id = p_client and c.deleted_at is null and (
       public.is_leader() or public.has_finance() or c.owner_id = (select auth.uid())
       or (public.is_bd_head() and (o.department_id = (select id from public.departments where code = 'bd') or o.supervisor_id = (select auth.uid())))));
$$;

create or replace function public.can_edit_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clients c join public.profiles o on o.id = c.owner_id
                  where c.id = p_client and c.deleted_at is null and (
                    public.is_leader() or c.owner_id = (select auth.uid())
                    or (public.is_bd_head() and (o.department_id = (select id from public.departments where code = 'bd') or o.supervisor_id = (select auth.uid())))));
$$;

-- Who may use the client tracker at all: Leader, Finance (read), the BD head, BD staff.
create or replace function public.can_use_clients()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_leader() or public.has_finance() or public.is_bd_head()
      or exists (select 1 from public.profiles p join public.departments d on d.id = p.department_id
                 where p.id = (select auth.uid()) and p.active and d.code = 'bd');
$$;

-- BD commission plan (spec 4.8): 2 % for 1–9 kiosks, 5 % for 10+, 10 % for key or multi-branch accounts; iScreen: setting.
create or replace function public.bd_plan_rate(p_client uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case
    when c.business = 'iscreen' then (public.setting('iscreen_bd_commission') #>> '{}')::numeric
    when c.is_key_account then 10
    when (select count(*) from public.client_kiosks k where k.client_id = c.id) >= 10 then 5
    when (select count(*) from public.client_kiosks k where k.client_id = c.id) >= 1 then 2
    else null end
  from public.clients c where c.id = p_client;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------
create or replace function public.save_client(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_owner uuid;
  c public.clients;
  k text;
begin
  -- Finance reads clients but never edits them.
  perform public.require(public.is_leader() or public.is_bd_head()
                         or exists (select 1 from public.profiles p join public.departments d on d.id = p.department_id where p.id = v_me and p.active and d.code = 'bd'),
                         'Only BD and Leaders can add or edit clients.');
  if v_id is null then
    -- The BD person who first registers a client owns it (same rule as the commission plan).
    v_owner := case when (public.is_leader() or public.is_bd_head()) and nullif(p ->> 'owner_id', '') is not null then (p ->> 'owner_id')::uuid else v_me end;
    insert into public.clients (name, type, business, owner_id, contact_name, contact_phone, status, is_key_account, created_by)
    values (trim(p ->> 'name'), p ->> 'type', (p ->> 'business')::public.business, v_owner, nullif(trim(coalesce(p ->> 'contact_name', '')), ''),
            nullif(trim(coalesce(p ->> 'contact_phone', '')), ''), coalesce(nullif(p ->> 'status', ''), 'prospect'), coalesce((p ->> 'is_key_account')::boolean, false), v_me)
    returning id into v_id;
  else
    select * into c from public.clients where id = v_id;
    perform public.require(public.can_edit_client(v_id), 'Only the client owner, the BD head or a Leader can edit this client.');
    v_owner := coalesce(nullif(p ->> 'owner_id', '')::uuid, c.owner_id);
    perform public.require(v_owner = c.owner_id or public.is_bd_head() or public.is_leader(), 'Only the BD head can change the owner.');
    update public.clients set name = trim(p ->> 'name'), type = p ->> 'type', business = (p ->> 'business')::public.business, owner_id = v_owner,
           contact_name = nullif(trim(coalesce(p ->> 'contact_name', '')), ''), contact_phone = nullif(trim(coalesce(p ->> 'contact_phone', '')), ''),
           status = coalesce(nullif(p ->> 'status', ''), status), is_key_account = coalesce((p ->> 'is_key_account')::boolean, is_key_account)
     where id = v_id;
    if v_owner <> c.owner_id then
      perform public.notify(v_owner, 'client_owner', 'You now own client: ' || c.name, null, '/clients/' || v_id, 'client', v_id);
    end if;
  end if;
  if p ? 'kiosks' then
    delete from public.client_kiosks where client_id = v_id;
    for k in select distinct upper(trim(x)) from jsonb_array_elements_text(p -> 'kiosks') x where trim(x) <> '' loop
      insert into public.client_kiosks (client_id, kiosk_id) values (v_id, k);
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.save_contract(p_client uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.require(public.can_edit_client(p_client), 'Only the client owner, the BD head or a Leader can do this.');
  insert into public.contracts (client_id, start_date, end_date, auto_renew, notice_days, special_terms, created_by)
  values (p_client, (p ->> 'start_date')::date, (p ->> 'end_date')::date, coalesce((p ->> 'auto_renew')::boolean, false),
          nullif(p ->> 'notice_days', '')::int, nullif(trim(coalesce(p ->> 'special_terms', '')), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- Activate a term: close the previous active one of the same kind.
create or replace function public.activate_client_term(p_term uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.client_terms;
begin
  select * into t from public.client_terms where id = p_term;
  update public.client_terms set status = 'superseded', valid_to = current_date
   where client_id = t.client_id and kind = t.kind and status = 'active' and id <> p_term;
  update public.client_terms set status = 'active', valid_from = current_date where id = p_term;
end;
$$;
revoke execute on function public.activate_client_term(uuid) from public, anon, authenticated;

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
  select exists (select 1 from public.client_terms where client_id = p_client and kind = v_kind and status = 'active') into v_has_prev;
  perform public.require(not v_has_prev or length(trim(coalesce(p ->> 'reason', ''))) >= 3, 'Say why the term changes.');
  insert into public.client_terms (client_id, kind, value, unit, basis, payout_timing, term_text, status, set_by, reason)
  values (p_client, v_kind, v_value, coalesce(nullif(p ->> 'unit', ''), 'percent'), nullif(p ->> 'basis', ''), nullif(trim(coalesce(p ->> 'payout_timing', '')), ''),
          nullif(trim(coalesce(p ->> 'term_text', '')), ''), 'pending', (select auth.uid()), nullif(trim(coalesce(p ->> 'reason', '')), ''))
  returning id into v_id;
  if v_kind = 'bd_share' then
    v_plan := public.bd_plan_rate(p_client);
    if v_plan is null or v_value <> v_plan then
      -- A rate outside the commission plan needs the BD head and a Leader (spec 4.8).
      select name into v_name from public.clients where id = p_client;
      for h in select d.head_id from public.departments d where d.code = 'bd' and d.head_id is not null union select public.leaders() loop
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
  perform public.require(public.is_bd_head() or public.is_leader(), 'Only the BD head or a Leader can approve.');
  perform public.require(t.set_by <> (select auth.uid()), 'You cannot approve your own proposal.');
  if not p_approve then
    update public.client_terms set status = 'rejected', valid_to = current_date where id = p_term;
    perform public.notify(t.set_by, 'client_term_decided', 'BD share not approved', null, '/clients/' || t.client_id, 'client', t.client_id);
    return;
  end if;
  update public.client_terms set
    approved_bd_head_by = case when public.is_bd_head() then (select auth.uid()) else approved_bd_head_by end,
    approved_leader_by = case when public.is_leader() then (select auth.uid()) else approved_leader_by end
   where id = p_term returning * into t;
  if t.approved_bd_head_by is not null and t.approved_leader_by is not null then
    perform public.activate_client_term(p_term);
    perform public.notify(t.set_by, 'client_term_decided', 'BD share approved', null, '/clients/' || t.client_id, 'client', t.client_id);
  end if;
end;
$$;

create or replace function public.add_client_note(p_client uuid, p_text text, p_tag text, p_noted_on date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require(public.can_edit_client(p_client), 'Only the client owner, the BD head or a Leader can add notes.');
  insert into public.client_notes (client_id, author_id, text, tag, noted_on) values (p_client, (select auth.uid()), trim(p_text), nullif(p_tag, ''), coalesce(p_noted_on, current_date));
end;
$$;

-- Notes can't be deleted; the author may edit within 24 hours (spec 4.8).
create or replace function public.edit_client_note(p_note uuid, p_text text, p_tag text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.client_notes set text = trim(p_text), tag = nullif(p_tag, ''), edited_at = now()
   where id = p_note and author_id = (select auth.uid()) and created_at > now() - interval '24 hours';
  perform public.require(found, 'Notes can be edited only by their author within 24 hours.');
end;
$$;

-- Monthly kiosk usage upload (back-office export): Finance, the Ops head or a Leader.
create or replace function public.upload_kiosk_usage(p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0;
begin
  perform public.require(public.is_leader() or public.has_finance() or public.heads_department('ops'), 'Only Finance, the Ops head or a Leader can upload usage.');
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.kiosk_usage_monthly (kiosk_id, month, rentals, sales, uploaded_by)
    values (upper(trim(r ->> 'kiosk_id')), date_trunc('month', (r ->> 'month')::date)::date, (r ->> 'rentals')::int, coalesce(nullif(r ->> 'sales', '')::numeric, 0), (select auth.uid()))
    on conflict (kiosk_id, month) do update set rentals = excluded.rentals, sales = excluded.sales, uploaded_by = excluded.uploaded_by, uploaded_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Zero usage: all of a client's kiosks had zero rentals in each of the last 3 uploaded months.
create or replace function public.client_zero_usage(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with months as (select distinct month from public.kiosk_usage_monthly order by month desc limit 3),
       k as (select kiosk_id from public.client_kiosks where client_id = p_client)
  select (select count(*) from months) = 3 and exists (select 1 from k)
     and not exists (select 1 from public.kiosk_usage_monthly u join k on k.kiosk_id = u.kiosk_id where u.month in (select month from months) and u.rentals > 0)
     and (select count(distinct u.month) from public.kiosk_usage_monthly u join k on k.kiosk_id = u.kiosk_id where u.month in (select month from months)) = 3;
$$;

-- Renewal reminders and zero-usage alerts. Messages name the client and end date, never the percentages.
create or replace function public.run_client_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_today date := public.manila_now()::date;
  v_left int;
  h uuid;
  v_task uuid;
  v_month date := (select max(month) from public.kiosk_usage_monthly);
begin
  for r in
    select c.*, k.id as contract_id, k.end_date
      from public.clients c
      join lateral (select * from public.contracts x where x.client_id = c.id order by x.end_date desc limit 1) k on true
     where c.deleted_at is null and c.status not in ('renewed', 'ended')
  loop
    v_left := r.end_date - v_today;
    if v_left <= 90 and v_left > 60 and public.once(r.contract_id, 'renewal_90') then
      insert into public.tasks (title, owner_id, assigned_by, due_at, business, acknowledged_at, description)
      values ('Start the renewal talk with ' || r.name, r.owner_id, r.owner_id, (r.end_date - 60)::timestamp at time zone 'Asia/Manila' + interval '17 hours',
              r.business, now(), 'Contract ends ' || to_char(r.end_date, 'DD Mon YYYY') || '.')
      returning id into v_task;
      perform public.notify(r.owner_id, 'renewal', 'Renewal in 90 days: ' || r.name, 'Contract ends ' || to_char(r.end_date, 'DD Mon YYYY') || '. A renewal task was created.', '/clients/' || r.id, 'client', r.id);
    end if;
    if v_left <= 60 and v_left > 30 and public.once(r.contract_id, 'renewal_60') then
      perform public.notify(r.owner_id, 'renewal', 'Renewal in 60 days: ' || r.name, 'Contract ends ' || to_char(r.end_date, 'DD Mon YYYY') || '.', '/clients/' || r.id, 'client', r.id);
    end if;
    if v_left <= 30 and v_left >= 0 and public.once(r.contract_id, 'renewal_30') then
      for h in select r.owner_id union select head_id from public.departments where code = 'bd' and head_id is not null loop
        perform public.notify(h, 'renewal', 'Renewal in 30 days: ' || r.name, 'Contract ends ' || to_char(r.end_date, 'DD Mon YYYY') || '.', '/clients/' || r.id, 'client', r.id);
      end loop;
    end if;
    if v_left < 0 and public.once(r.contract_id, 'renewal_passed') then
      for h in select r.owner_id union select head_id from public.departments where code = 'bd' and head_id is not null union select public.leaders() loop
        perform public.notify(h, 'renewal_overdue', 'Contract ended, not renewed: ' || r.name, 'Ended ' || to_char(r.end_date, 'DD Mon YYYY') || '.', '/clients/' || r.id, 'client', r.id, true);
      end loop;
    end if;
  end loop;
  if v_month is not null then
    for r in select c.* from public.clients c where c.deleted_at is null and c.status not in ('ended') and public.client_zero_usage(c.id) loop
      if public.once(r.id, 'zero_usage', v_month::text) then
        for h in select r.owner_id union select head_id from public.departments where code = 'bd' and head_id is not null loop
          perform public.notify(h, 'zero_usage', 'Zero rentals for 3 months: ' || r.name, 'Check the pull-out clause in the contract.', '/clients/' || r.id, 'client', r.id);
        end loop;
      end if;
    end loop;
  end if;
end;
$$;
select cron.schedule('oh-client-reminders', '7 0 * * *', 'select public.run_client_reminders();');

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_kiosks enable row level security;
alter table public.contracts enable row level security;
alter table public.client_terms enable row level security;
alter table public.client_notes enable row level security;
alter table public.kiosk_usage_monthly enable row level security;
create policy "clients: visible" on public.clients for select to authenticated using (deleted_at is null and public.can_see_client(id));
create policy "client_kiosks: visible" on public.client_kiosks for select to authenticated using (public.can_see_client(client_id));
create policy "contracts: visible" on public.contracts for select to authenticated using (public.can_see_client(client_id));
create policy "client_terms: visible" on public.client_terms for select to authenticated using (public.can_see_client(client_id));
create policy "client_notes: visible" on public.client_notes for select to authenticated using (public.can_see_client(client_id));
create policy "usage: client tracker users" on public.kiosk_usage_monthly for select to authenticated using (public.is_active_user() and (public.can_use_clients() or public.heads_department('ops')));
drop policy "attachments: visible files" on public.attachments;
create policy "attachments: visible files" on public.attachments for select to authenticated
  using (deleted_at is null and ((entity = 'task' and public.can_see_task(entity_id)) or (entity = 'project' and public.can_see_project(entity_id))
                                 or (entity = 'issue' and public.can_see_issue(entity_id)) or (entity = 'meeting' and public.can_see_meeting(entity_id))
                                 or (entity = 'client' and public.can_see_client(entity_id))));
grant select on public.clients, public.client_kiosks, public.contracts, public.client_terms, public.client_notes, public.kiosk_usage_monthly to authenticated;
grant all on public.clients, public.client_kiosks, public.contracts, public.client_terms, public.client_notes, public.kiosk_usage_monthly to service_role;

do $$
declare f text;
begin
  foreach f in array array['save_client(uuid, jsonb)', 'save_contract(uuid, jsonb)', 'set_client_term(uuid, jsonb)', 'decide_client_term(uuid, boolean)',
                           'add_client_note(uuid, text, text, date)', 'edit_client_note(uuid, text, text)', 'upload_kiosk_usage(jsonb)', 'client_zero_usage(uuid)',
                           'can_see_client(uuid)', 'can_edit_client(uuid)', 'can_use_clients()', 'bd_plan_rate(uuid)', 'is_bd_head()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.run_client_reminders() from public, anon, authenticated;
