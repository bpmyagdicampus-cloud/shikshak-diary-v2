/*
# Programs and academic years RLS

1. Plain-English: campus members read programs and academic years; campus admins
   manage academic years; campus admins and department heads manage programs.
2. Security: RLS SELECT + write policies, scoped to authenticated; grants added.
3. Notes: safe to re-run.
*/

alter table public.programs enable row level security;
alter table public.academic_years enable row level security;

grant select, insert, update, delete on public.programs to authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;

drop policy if exists "programs_select" on public.programs;
create policy "programs_select" on public.programs for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "programs_write" on public.programs;
create policy "programs_write" on public.programs for all
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or department_id in (select public.user_dept_ids())
)
with check (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or department_id in (select public.user_dept_ids())
);

drop policy if exists "academic_years_select" on public.academic_years;
create policy "academic_years_select" on public.academic_years for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "academic_years_write" on public.academic_years;
create policy "academic_years_write" on public.academic_years for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));
