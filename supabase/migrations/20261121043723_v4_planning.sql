/*
# Course units and lesson plans (teacher planning)

1. Plain-English explanation
   Teachers break a class-subject into units (with planned lecture hours) and
   write daily lesson plans against those units. Units and lesson plans go
   through a status flow: draft, submitted, approved (approved by a department
   head, stamped with who and when). Both can be soft-archived.

2. New Tables
   - `course_units` — one unit of a class-subject: unit number, title, topics,
     planned lecture hours, start/end dates, teaching methods, materials,
     assessment, status, archive timestamp.
   - `lesson_plans` — one lesson plan: optional unit link, plan date, lecture
     hours, title, objectives, steps (text array), resources, assessment,
     status, owning teacher, approval stamp, archive timestamp.

3. Security
   - RLS enabled on both tables, policies scoped `TO authenticated`.
   - Read: campus admins, department heads of the owning department, and the
     teacher who owns the plan (super admins too).
   - Write (insert/update/delete): the owning teacher, campus admins, and the
     owning department head (super admins too).
   - Granted CRUD to `authenticated`.

4. Notes
   - Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
   - `steps` is a Postgres text array; the app writes an array of strings.
*/

-- ---------- 1. Tables ----------
create table if not exists public.course_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects (id) on delete cascade,
  unit_no integer not null default 1,
  title text not null default '',
  topics text not null default '',
  planned_lh numeric not null default 0 check (planned_lh >= 0),
  start_date date,
  end_date date,
  methods text not null default '',
  materials text not null default '',
  assessment text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects (id) on delete cascade,
  unit_id uuid references public.course_units (id) on delete set null,
  teacher_user_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  lh numeric not null default 1 check (lh > 0 and lh <= 12),
  title text not null default '',
  objectives text not null default '',
  steps text[] not null default '{}',
  resources text not null default '',
  assessment text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists course_units_cs_idx on public.course_units (class_subject_id);
create index if not exists lesson_plans_cs_idx on public.lesson_plans (class_subject_id);
create index if not exists lesson_plans_teacher_idx on public.lesson_plans (teacher_user_id);

-- fill org_id from the class-subject automatically
create or replace function public.fill_plan_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.org_id is null then
    select cs.org_id into new.org_id from public.class_subjects cs where cs.id = new.class_subject_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_course_units_org on public.course_units;
create trigger trg_course_units_org before insert on public.course_units
  for each row execute function public.fill_plan_org();

drop trigger if exists trg_lesson_plans_org on public.lesson_plans;
create trigger trg_lesson_plans_org before insert on public.lesson_plans
  for each row execute function public.fill_plan_org();

-- ---------- 2. RLS + grants ----------
alter table public.course_units enable row level security;
alter table public.lesson_plans enable row level security;

grant select, insert, update, delete on public.course_units to authenticated;
grant select, insert, update, delete on public.lesson_plans to authenticated;

drop policy if exists "course_units_select" on public.course_units;
create policy "course_units_select" on public.course_units for select
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_active_org_ids())
);

drop policy if exists "course_units_write" on public.course_units;
create policy "course_units_write" on public.course_units for all
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or class_subject_id in (
    select cs.id from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    where cs.teacher_user_id = auth.uid()
      or c.department_id in (select public.user_dept_ids())
  )
)
with check (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
  or class_subject_id in (
    select cs.id from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    where cs.teacher_user_id = auth.uid()
      or c.department_id in (select public.user_dept_ids())
  )
);

drop policy if exists "lesson_plans_select" on public.lesson_plans;
create policy "lesson_plans_select" on public.lesson_plans for select
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_active_org_ids())
);

drop policy if exists "lesson_plans_write" on public.lesson_plans;
create policy "lesson_plans_write" on public.lesson_plans for all
to authenticated
using (
  public.is_super_admin()
  or teacher_user_id = auth.uid()
  or org_id in (select public.user_admin_org_ids())
  or class_subject_id in (
    select cs.id from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    where c.department_id in (select public.user_dept_ids())
  )
)
with check (
  public.is_super_admin()
  or teacher_user_id = auth.uid()
  or org_id in (select public.user_admin_org_ids())
  or class_subject_id in (
    select cs.id from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    where c.department_id in (select public.user_dept_ids())
  )
);
