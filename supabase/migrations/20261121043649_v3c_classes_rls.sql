/*
# Classes RLS

1. Plain-English: campus members read classes; campus admins and department heads manage them.
2. Security: RLS SELECT + write policy on classes, scoped to authenticated; grants added.
3. Notes: safe to re-run.
*/

alter table public.classes enable row level security;

grant select, insert, update, delete on public.classes to authenticated;

drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "classes_write" on public.classes;
create policy "classes_write" on public.classes for all
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
