-- Owner decision (25 Nov 2026): Office Hub is internal only, for work management and monitoring.
-- It never contacts customers (no SMS, no rating requests). Customers are contacted in a separate process;
-- CS records the outcome (e.g. the customer's rating) on the case.

create or replace function public.set_case_status(p_case uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cs_cases;
begin
  select * into c from public.cs_cases where id = p_case and deleted_at is null for update;
  perform public.require(found and public.can_work_case(p_case), 'Only the case owner or the CS lead can do this.');
  perform public.require(p_status in ('open', 'waiting_customer', 'solved'), 'Unknown status.');
  -- Clock stops while waiting on the customer.
  if c.status = 'waiting_customer' and c.waiting_since is not null and p_status <> 'waiting_customer' then
    update public.cs_cases set waiting_work_minutes = waiting_work_minutes + public.cs_working_minutes(waiting_since, now()),
           waiting_clock_minutes = waiting_clock_minutes + (extract(epoch from now() - waiting_since) / 60)::int, waiting_since = null where id = p_case;
  end if;
  if p_status = 'solved' then
    update public.cs_cases set status = 'solved', solved_at = now() where id = p_case;
    perform public.cs_event(p_case, 'action', 'Marked solved');
  elsif p_status = 'waiting_customer' then
    update public.cs_cases set status = 'waiting_customer', waiting_since = now() where id = p_case;
    perform public.cs_event(p_case, 'action', 'Waiting on customer (clock stopped)');
  else
    if c.status = 'solved' then
      perform public.require(c.solved_at > now() - interval '7 days', 'A case can be reopened within 7 days of solving it. Create a new case instead.');
      update public.cs_cases set status = 'open', reopened_at = now(), reopen_count = reopen_count + 1, solved_at = null where id = p_case;
      perform public.cs_event(p_case, 'action', 'Reopened: the customer came back');
    else
      update public.cs_cases set status = 'open' where id = p_case;
      perform public.cs_event(p_case, 'action', 'Back to open');
    end if;
  end if;
end;
$$;

create or replace function public.mark_refund_paid(p_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.cs_refund_requests; c public.cs_cases;
begin
  select * into r from public.cs_refund_requests where id = p_id for update;
  perform public.require(found and r.status = 'approved', 'Approve the refund first.');
  perform public.require(public.has_finance() or public.is_leader(), 'Only Finance can mark refunds paid.');
  perform public.require(r.requested_by <> (select auth.uid()), 'You cannot pay your own refund request.');
  perform public.require(length(trim(coalesce(p_reference, ''))) >= 3, 'Add the reference number.');
  update public.cs_refund_requests set status = 'paid', paid_by = (select auth.uid()), paid_at = now(), reference_no = trim(p_reference) where id = p_id;
  select * into c from public.cs_cases where id = r.case_id;
  update public.cs_cases set status = 'open' where id = r.case_id and status = 'waiting_finance';
  insert into public.cs_case_events (case_id, actor_id, kind, text) values (r.case_id, (select auth.uid()), 'system', 'Refund paid: ₱' || r.amount || ', reference ' || trim(p_reference));
  perform public.notify(r.requested_by, 'refund_paid', 'Refund paid: case #' || c.ref, 'Reference ' || trim(p_reference) || '.', '/cs/' || r.case_id, 'cs_case', r.case_id);
end;
$$;

create or replace function public.run_cs_anonymize()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('oh.anonymizing', 'on', true);
  update public.cs_cases set customer_name = null, customer_mobile = null, anonymized_at = now()
   where anonymized_at is null and created_at < now() - make_interval(years => (public.setting('cs_anonymize_years') #>> '{}')::int);
end;
$$;

drop table if exists public.sms_outbox;
alter table public.cs_cases drop column if exists rating_requested_at;
