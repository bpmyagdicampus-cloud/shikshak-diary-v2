/*
# Academic hierarchy tables: departments, programs, academic years, classes, sections, subjects, class-subjects

1. Plain-English explanation
   Inside each campus the academic structure is: a campus has departments; a
   department runs programs; each program teaches classes in a given academic
   year; a class can have sections; a department also owns subjects; and a
   class-subject links a subject to a class with a teacher and total lecture
   hours. Everything can be soft-archived (kept but hidden) and deleting records
   still in use is blocked by foreign keys.

2. New Tables
   - `departments` — campus departments (Nepali name + optional English name).
   - `programs` — study programs belonging to a department.
   - `academic_years` — per-campus school years with start/end dates; only one
     active year allowed per campus (partial unique index).
   - `classes` — a program's class for a given academic year.
   - `sections` — sections within a class.
   - `subjects` — subjects owned by a department, with optional code.
   - `class_subjects` — links subject to class with teacher and total lecture hours.

3. Modified Tables
   - `memberships.department_id` now has a foreign key to `departments`.

4. Security
   - RLS will be enabled and policies added in the next migration; this migration
     only creates the structure. No grants yet.

5. Notes
   - Safe to re-run (IF NOT EXISTS everywhere).
   - Deleting a campus cascades to its whole hierarchy.
*/

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  name_en text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  name_en text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint academic_years_date_order check (end_date >= start_date)
);

create unique index if not exists academic_years_one_active
  on public.academic_years (org_id) where is_active and archived_at is null;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  name_en text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  name_en text,
  code text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  teacher_user_id uuid references public.profiles (id) on delete set null,
  total_lh numeric not null default 0 check (total_lh >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'memberships_department_fkey'
  ) then
    alter table public.memberships
      add constraint memberships_department_fkey
      foreign key (department_id) references public.departments (id) on delete set null;
  end if;
end $$;

create index if not exists departments_org_idx on public.departments (org_id);
create index if not exists programs_dept_idx on public.programs (department_id);
create index if not exists academic_years_org_idx on public.academic_years (org_id);
create index if not exists classes_program_year_idx on public.classes (program_id, academic_year_id);
create index if not exists sections_class_idx on public.sections (class_id);
create index if not exists subjects_dept_idx on public.subjects (department_id);
create index if not exists class_subjects_class_idx on public.class_subjects (class_id);
create index if not exists class_subjects_teacher_idx on public.class_subjects (teacher_user_id);
