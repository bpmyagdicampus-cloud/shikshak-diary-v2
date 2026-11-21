/*
# Departments RLS (test slice)

1. Plain-English: campus members read departments; campus admins manage them.
2. Security: RLS SELECT + write policies on departments, scoped to authenticated.
3. Notes: safe to re-run.
*/

alter table public.departments enable row level security;

grant select, insert, update, delete on public.departments to authenticated;

drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "departments_write" on public.departments;
create policy "departments_write" on public.departments for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));
