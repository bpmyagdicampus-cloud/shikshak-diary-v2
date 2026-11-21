/*
# Calendars: event types, events, campus settings, department academic calendars

1. Plain-English explanation
   Two calendar views exist. The campus-wide annual calendar lists event types
   (with a holiday flag) and dated events (which block teaching and whether the
   campus stays open), plus a campus setting for which weekdays are off. The
   department academic calendar is a per-department, per-year plan with header
   details (class start/end times, working/teaching day totals, status) and dated
   items (entry type, title, dates, notes).

2. New Tables
   - `calendar_event_types` — per-campus event type names with is_holiday flag.
   - `calendar_events` — dated events: title, type, flags, start/end dates, notes.
   - `campus_calendar_settings` — one row per campus: weekly off weekdays
     (integer array of JS getDay values), updated_at.
   - `academic_calendars` — per department + academic year header with class
     start/end, working/teaching day totals, status, notes.
   - `academic_calendar_items` — dated items under a calendar: type, title,
     dates, notes.

3. Security
   - RLS enabled on all five tables; policies scoped `TO authenticated`.
   - Read: any active campus member (plus super admins).
   - Write: campus admins (plus super admins).
   - Granted CRUD to `authenticated`.

4. Notes
   - Safe to re-run. Unique index prevents duplicate campus settings rows.
   - The app inserts default event types itself; no seed data here.
*/

-- ---------- 1. Tables ----------
create table if not exists public.calendar_event_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_holiday boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  event_type text not null default 'event'
    check (event_type in ('event', 'holiday', 'exam', 'activity')),
  event_type_id uuid references public.calendar_event_types (id) on delete set null,
  is_holiday boolean not null default false,
  teaching_off boolean not null default false,
  campus_open boolean not null default true,
  start_date date not null,
  end_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint calendar_events_date_order check (end_date is null or end_date >= start_date)
);

create table if not exists public.campus_calendar_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  weekly_off_days integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_calendars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  class_start text,
  class_end text,
  total_working_days integer not null default 0,
  total_teaching_days integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.academic_calendar_items (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.academic_calendars (id) on delete cascade,
  item_type text not null default 'event'
    check (item_type in ('event', 'holiday', 'exam', 'activity')),
  title text not null,
  start_date date not null,
  end_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint aci_date_order check (end_date is null or end_date >= start_date)
);

create index if not exists calendar_event_types_org_idx on public.calendar_event_types (org_id);
create index if not exists calendar_events_org_idx on public.calendar_events (org_id, start_date);
create index if not exists academic_calendars_dept_year_idx
  on public.academic_calendars (department_id, academic_year_id);
create index if not exists academic_calendar_items_cal_idx on public.academic_calendar_items (calendar_id);

-- ---------- 2. RLS + grants ----------
alter table public.calendar_event_types enable row level security;
alter table public.calendar_events enable row level security;
alter table public.campus_calendar_settings enable row level security;
alter table public.academic_calendars enable row level security;
alter table public.academic_calendar_items enable row level security;

grant select, insert, update, delete on public.calendar_event_types to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.campus_calendar_settings to authenticated;
grant select, insert, update, delete on public.academic_calendars to authenticated;
grant select, insert, update, delete on public.academic_calendar_items to authenticated;

drop policy if exists "calendar_event_types_select" on public.calendar_event_types;
create policy "calendar_event_types_select" on public.calendar_event_types for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "calendar_event_types_write" on public.calendar_event_types;
create policy "calendar_event_types_write" on public.calendar_event_types for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "calendar_events_write" on public.calendar_events;
create policy "calendar_events_write" on public.calendar_events for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

drop policy if exists "campus_calendar_settings_select" on public.campus_calendar_settings;
create policy "campus_calendar_settings_select" on public.campus_calendar_settings for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "campus_calendar_settings_write" on public.campus_calendar_settings;
create policy "campus_calendar_settings_write" on public.campus_calendar_settings for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

drop policy if exists "academic_calendars_select" on public.academic_calendars;
create policy "academic_calendars_select" on public.academic_calendars for select
to authenticated
using (public.is_super_admin() or org_id in (select public.user_active_org_ids()));

drop policy if exists "academic_calendars_write" on public.academic_calendars;
create policy "academic_calendars_write" on public.academic_calendars for all
to authenticated
using (public.is_super_admin() or org_id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or org_id in (select public.user_admin_org_ids()));

drop policy if exists "academic_calendar_items_select" on public.academic_calendar_items;
create policy "academic_calendar_items_select" on public.academic_calendar_items for select
to authenticated
using (
  public.is_super_admin()
  or calendar_id in (
    select ac.id from public.academic_calendars ac
    where ac.org_id in (select public.user_active_org_ids())
  )
);

drop policy if exists "academic_calendar_items_write" on public.academic_calendar_items;
create policy "academic_calendar_items_write" on public.academic_calendar_items for all
to authenticated
using (
  public.is_super_admin()
  or calendar_id in (
    select ac.id from public.academic_calendars ac
    where ac.org_id in (select public.user_admin_org_ids())
  )
)
with check (
  public.is_super_admin()
  or calendar_id in (
    select ac.id from public.academic_calendars ac
    where ac.org_id in (select public.user_admin_org_ids())
  )
);
