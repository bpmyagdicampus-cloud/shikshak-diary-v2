/*
# Sections, subjects, class-subjects RLS

1. Plain-English: campus members read these; campus admins manage sections;
   admins and department heads manage subjects; class-subjects are managed by
   campus admins (class_subjects has no department column, so the department-head
   check goes through the parent class instead).
2. Security: RLS SELECT + write policies on three tables, scoped to authenticated;
   grants added.
3. Notes: safe to re-run.
*/

alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;

grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.class_subjects to authenticated;

drop policy if exists "sections_select" on public.sections;
create policy "sections_select" on public.sections for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "sections_write" on public.sections;
create policy "sections_write" on public.sections for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

drop policy if exists "subjects_select" on public.subjects;
create policy "subjects_select" on public.subjects for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "subjects_write" on public.subjects;
create policy "subjects_write" on public.subjects for all
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

drop policy if exists "class_subjects_select" on public.class_subjects;
create policy "class_subjects_select" on public.class_subjects for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "class_subjects_write" on public.class_subjects;
create policy "class_subjects_write" on public.class_subjects for all
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or class_id in (
    select c.id from public.classes c
    where c.department_id in (select public.user_dept_ids())
  )
)
with check (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or class_id in (
    select c.id from public.classes c
    where c.department_id in (select public.user_dept_ids())
  )
);
