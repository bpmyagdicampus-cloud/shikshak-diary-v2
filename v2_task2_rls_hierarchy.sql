-- =====================================================================
-- Task 2: Multi-tenant RLS — departments, programs, classes, subjects
-- नियम: user ले केवल आफ्नो सक्रिय सदस्यता भएका org_id (क्याम्पस) का डाटा
--       पढ्न/लेख्न सक्छ। Super admin सबै।
-- Column नाम: org_id (campus_id होइन)।
-- Requires: v2_phase1_foundation.sql, v2_phase2_policies.sql, v2_setup_foundation.sql
-- Safe to re-run.
-- =====================================================================

-- ---------- १. Helper functions (RLS बाट memberships पढ्न security definer) ----------
create or replace function public.user_active_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.org_id from public.memberships m
  where m.user_id = auth.uid() and m.is_active;
$$;

create or replace function public.user_admin_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.org_id from public.memberships m
  where m.user_id = auth.uid() and m.is_active and m.role = 'admin';
$$;

create or replace function public.user_dept_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select m.department_id from public.memberships m
  where m.user_id = auth.uid() and m.is_active
    and m.role = 'department_head' and m.department_id is not null;
$$;

create index if not exists memberships_active_user_idx
  on public.memberships (user_id) where is_active;

-- ---------- २. Integrity: विभाग/कार्यक्रम/कक्षा/विषय सबै एउटै org मा हुनुपर्छ ----------
create or replace function public.enforce_department_same_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.departments d
    where d.id = new.department_id and d.org_id = new.org_id
  ) then
    raise exception 'विभाग यो क्याम्पसको होइन / Department does not belong to this campus';
  end if;
  return new;
end $$;

drop trigger if exists trg_programs_same_org on public.programs;
create trigger trg_programs_same_org before insert or update on public.programs
  for each row execute function public.enforce_department_same_org();

drop trigger if exists trg_classes_same_org on public.classes;
create trigger trg_classes_same_org before insert or update on public.classes
  for each row execute function public.enforce_department_same_org();

drop trigger if exists trg_subjects_same_org on public.subjects;
create trigger trg_subjects_same_org before insert or update on public.subjects
  for each row execute function public.enforce_department_same_org();

-- ---------- ३. पुराना policy हटाउने ----------
drop policy if exists dept_read on public.departments;
drop policy if exists dept_write on public.departments;
drop policy if exists programs_read on public.programs;
drop policy if exists programs_write on public.programs;
drop policy if exists classes_read on public.classes;
drop policy if exists classes_write on public.classes;
drop policy if exists subjects_read on public.subjects;
drop policy if exists subjects_write on public.subjects;
drop policy if exists departments_select on public.departments;
drop policy if exists departments_write on public.departments;
drop policy if exists programs_select on public.programs;
drop policy if exists programs_write2 on public.programs;
drop policy if exists classes_select on public.classes;
drop policy if exists classes_write2 on public.classes;
drop policy if exists subjects_select on public.subjects;
drop policy if exists subjects_write2 on public.subjects;

alter table public.departments enable row level security;
alter table public.programs    enable row level security;
alter table public.classes     enable row level security;
alter table public.subjects    enable row level security;

-- ---------- ४. departments: पढ्ने = सदस्य क्याम्पस; लेख्ने = admin ---------
create policy departments_select on public.departments for select to authenticated
  using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

create policy departments_write on public.departments for all to authenticated
  using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

-- ---------- ५. programs: पढ्ने = सदस्य; लेख्ने = admin वा त्यही विभागको प्रमुख ----------
create policy programs_select on public.programs for select to authenticated
  using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

create policy programs_write on public.programs for all to authenticated
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

-- ---------- ६. classes: उही नियम ----------
create policy classes_select on public.classes for select to authenticated
  using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

create policy classes_write on public.classes for all to authenticated
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

-- ---------- ७. subjects: उही नियम ----------
create policy subjects_select on public.subjects for select to authenticated
  using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

create policy subjects_write on public.subjects for all to authenticated
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

-- ---------- ८. परीक्षण (दुई user बनाएर SQL Editor बाट हेर्नुहोस्) ----------
-- क) अर्को क्याम्पसको org_id लेखेर insert गर्दा असफल हुनुपर्छ:
--    insert into public.departments (org_id, name) values ('<अर्को-क्याम्पस-uuid>', 'Test');
-- ख) आफ्नो क्याम्पसमा मात्र rows देखिनुपर्छ (user को JWT सहित, Table Editor होइन)।
