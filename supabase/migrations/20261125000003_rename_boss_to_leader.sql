-- The top access level is called "Leader" (was "Boss").
alter type public.access_level rename value 'boss' to 'leader';
alter function public.is_boss() rename to is_leader;

alter policy "departments: boss insert" on public.departments rename to "departments: leader insert";
alter policy "departments: boss update" on public.departments rename to "departments: leader update";
alter policy "departments: boss delete" on public.departments rename to "departments: leader delete";
alter policy "domains: boss read" on public.allowed_email_domains rename to "domains: leader read";
alter policy "domains: boss insert" on public.allowed_email_domains rename to "domains: leader insert";
alter policy "domains: boss delete" on public.allowed_email_domains rename to "domains: leader delete";
alter policy "audit: boss read all" on public.audit_log rename to "audit: leader read all";

-- Rebuild the function body so it checks the renamed value.
create or replace function public.is_leader()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.active and p.access_level = 'leader');
$$;
