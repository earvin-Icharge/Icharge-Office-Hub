-- New Supabase projects don't grant table access to the API roles automatically.
-- Row Level Security (migration 0001) still decides which ROWS each person sees.

-- Server (service key): full access, used only by trusted server code and builder scripts.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Signed-in users: what the access table allows, row by row via RLS.
grant usage on schema public to authenticated;
grant select on public.departments, public.profiles, public.allowed_email_domains, public.audit_log to authenticated;
grant insert, update, delete on public.departments to authenticated;           -- RLS: Boss only
grant insert, delete on public.allowed_email_domains to authenticated;         -- RLS: Boss only
grant update (language, default_business, telegram_chat_id) on public.profiles to authenticated; -- RLS: own row

-- Not signed in: nothing.
revoke all on all tables in schema public from anon;
