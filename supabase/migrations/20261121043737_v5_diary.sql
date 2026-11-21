/*
# Teacher diary entries

1. Plain-English explanation
   Teachers keep a daily teaching diary against a class-subject: date, lecture
   hours taught, unit, topic, attendance counts, remarks, class activity codes,
   special remarks, teaching methods, student activities, feedback and evaluation.
   Rules enforced by the database: a teacher can add or change entries only for
   class-subjects they teach, only up to today, and only within the last 7 days.

2. New Tables
   - `diary_entries` — one diary row per entry: class-subject, teacher, entry
     date, lecture hours (0-12), unit, topic, attendance totals, remarks,
     activities (text array), special remark, monthly-report flag, methods,
     student activities, feedback, evaluation.

3. Security
   - RLS enabled; policies scoped `TO authenticated`.
   - Insert/update: the owning teacher, who must teach that class-subject, for
     entry dates between today-7 and today (super admins and campus admins also
     manage).
   - Delete: the owning teacher within the same window (plus admins).
   - Read: the author, department head, campus admin, super admin.
   - Granted CRUD to `authenticated`.
   - Helper function `teaches_class_subject(uuid)` (security definer) checks
     teacher assignment without recursive RLS; execute revoked from public/anon,
     granted to authenticated.

4. Notes
   - Safe to re-run. `org_id` is filled automatically from the class-subject.
   - Attendance checks: counts non-negative, present + absent <= total.
*/

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects (id) on delete cascade,
  teacher_user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  lh numeric not null default 0,
  unit text not null default '',
  topic text not null default '',
  total_students integer not null default 0,
  present_count integer not null default 0,
  absent_count integer not null default 0,
  remarks text not null default '',
  activities text[] not null default '{}',
  special_remark text not null default '',
  special_in_monthly boolean not null default false,
  methods text not null default '',
  student_activities text not null default '',
  student_feedback text not null default '',
  evaluation_done text not null default '',
  created_at timestamptz not null default now(),
  constraint diary_lh_range check (lh >= 0 and lh <= 12),
  constraint diary_counts_nonneg
    check (total_students >= 0 and present_count >= 0 and absent_count >= 0),
  constraint diary_counts_ok check (present_count + absent_count <= total_students)
);

create index if not exists diary_entries_teacher_idx on public.diary_entries (teacher_user_id);
create index if not exists diary_entries_cs_idx on public.diary_entries (class_subject_id);
create index if not exists diary_entries_org_date_idx on public.diary_entries (org_id, entry_date);

-- org_id filled from class-subject
create or replace function public.fill_diary_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    select cs.org_id into new.org_id from public.class_subjects cs where cs.id = new.class_subject_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_diary_org on public.diary_entries;
create trigger trg_diary_org before insert on public.diary_entries
  for each row execute function public.fill_diary_org();

-- teacher assignment check used by the write policies
create or replace function public.teaches_class_subject(p_class_subject_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.id = p_class_subject_id and cs.teacher_user_id = auth.uid()
  );
$$;

revoke execute on function public.teaches_class_subject(uuid) from public, anon;
grant execute on function public.teaches_class_subject(uuid) to authenticated;

-- ---------- RLS + grants ----------
alter table public.diary_entries enable row level security;

grant select, insert, update, delete on public.diary_entries to authenticated;

drop policy if exists "diary_select" on public.diary_entries;
create policy "diary_select" on public.diary_entries for select
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
);

drop policy if exists "diary_insert" on public.diary_entries;
create policy "diary_insert" on public.diary_entries for insert
to authenticated
with check (
  teacher_user_id = auth.uid()
  and public.teaches_class_subject(class_subject_id)
  and entry_date <= current_date
  and entry_date >= current_date - 7
);

drop policy if exists "diary_update" on public.diary_entries;
create policy "diary_update" on public.diary_entries for update
to authenticated
using (
  teacher_user_id = auth.uid()
  and entry_date >= current_date - 7
  or public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
)
with check (
  teacher_user_id = auth.uid()
  and public.teaches_class_subject(class_subject_id)
  and entry_date <= current_date
  and entry_date >= current_date - 7
  or public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);

drop policy if exists "diary_delete" on public.diary_entries;
create policy "diary_delete" on public.diary_entries for delete
to authenticated
using (
  teacher_user_id = auth.uid()
  and entry_date >= current_date - 7
  or public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);
