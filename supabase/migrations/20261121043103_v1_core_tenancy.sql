/*
# Core tenancy: organizations, profiles, platform roles, memberships, audit log

1. Plain-English explanation
   This is a multi-campus (multi-tenant) school management app. A "campus" is an
   organization (tenant). People sign in with email/password and get a profile.
   A "membership" links a person to a campus with a role (admin, department_head,
   teacher, or student). A few platform-wide super admins are tracked separately.

2. New Tables
   - `organizations` — campuses (tenants): name, English name, month the academic
     year starts, soft-archive timestamp.
   - `profiles` — one per signed-in user: full name, email, phone, language
     preference (Nepali/English) and date preference (Bikram Sambat/AD), plus a
     flag forcing a password change on first login.
   - `platform_roles` — one row per super admin (user id only).
   - `memberships` — links a user to a campus with a role and optional department;
     can be deactivated without deleting.
   - `audit_log` — append-only activity log written by server-side code.

3. Security
   - RLS enabled on every table.
   - All policies are scoped `TO authenticated` (the app requires sign-in).
   - `organizations`: visible to members of the campus and super admins; only
     super admins create/delete, campus admins update.
   - `profiles`: users read/update their own row; campus admins can read profiles
     of people in their campus (needed for member/teacher lists). Password change
     flag is updated by the user's own account page.
   - `platform_roles`: users can see their own super-admin status; only super
     admins manage it.
   - `memberships`: users see their own; campus admins see and manage memberships
     of their campus.
   - `audit_log`: no client policies at all — only server code (service role)
     touches it.
   - Helper security-definer functions used by all later migrations:
     `is_super_admin()`, `user_active_org_ids()`, `user_admin_org_ids()`,
     `user_dept_ids()`. These read membership tables without recursive RLS.
   - Grants: authenticated role gets only the verbs the app uses; service role
     gets full access for the user-management edge functions.

4. Notes
   - No destructive operations; safe to re-run (IF EXISTS / DROP POLICY first).
   - Tables are created before the helper functions that read them.
   - Profile rows default the language to Nepali and date preference to Bikram Sambat.
*/

-- ---------- 1. Tables ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  academic_year_start_month integer not null default 1
    check (academic_year_start_month between 1 and 12),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  lang text not null default 'ne' check (lang in ('ne', 'en')),
  date_pref text not null default 'bs' check (date_pref in ('bs', 'ad')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null check (role in ('admin', 'department_head', 'teacher', 'student')),
  department_id uuid, -- FK to departments added in the hierarchy migration
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_org_idx on public.memberships (org_id);
create index if not exists memberships_active_user_idx on public.memberships (user_id) where is_active;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null
    check (action in ('insert', 'update', 'archive', 'restore', 'delete', 'password_reset')),
  table_name text,
  record_id text,
  details jsonb,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 2. Helper functions (security definer so RLS cannot recurse) ----------
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_roles r where r.user_id = auth.uid());
$$;

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

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.user_active_org_ids() from public, anon;
revoke all on function public.user_admin_org_ids() from public, anon;
revoke all on function public.user_dept_ids() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.user_active_org_ids() to authenticated;
grant execute on function public.user_admin_org_ids() to authenticated;
grant execute on function public.user_dept_ids() to authenticated;

-- ---------- 3. RLS + grants ----------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

grant select, insert, update, delete on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, lang, date_pref, must_change_password) on public.profiles to authenticated;
grant select, insert, delete on public.platform_roles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.platform_roles to service_role;
grant select, insert, update, delete on public.memberships to service_role;
grant select, insert, update, delete on public.audit_log to service_role;

-- ---------- 4. Policies ----------
drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations for select
to authenticated
using (public.is_super_admin() or id in (select public.user_active_org_ids()));

drop policy if exists "organizations_insert" on public.organizations;
create policy "organizations_insert" on public.organizations for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "organizations_update" on public.organizations;
create policy "organizations_update" on public.organizations for update
to authenticated
using (public.is_super_admin() or id in (select public.user_admin_org_ids()))
with check (public.is_super_admin() or id in (select public.user_admin_org_ids()));

drop policy if exists "organizations_delete" on public.organizations;
create policy "organizations_delete" on public.organizations for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1 from public.memberships tm
    where tm.user_id = profiles.id
      and tm.is_active
      and tm.org_id in (select public.user_admin_org_ids())
  )
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "platform_roles_select" on public.platform_roles;
create policy "platform_roles_select" on public.platform_roles for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "platform_roles_insert" on public.platform_roles;
create policy "platform_roles_insert" on public.platform_roles for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "platform_roles_delete" on public.platform_roles;
create policy "platform_roles_delete" on public.platform_roles for delete
to authenticated
using (public.is_super_admin());

drop policy if exists "memberships_select" on public.memberships;
create policy "memberships_select" on public.memberships for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);

drop policy if exists "memberships_insert" on public.memberships;
create policy "memberships_insert" on public.memberships for insert
to authenticated
with check (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);

drop policy if exists "memberships_update" on public.memberships;
create policy "memberships_update" on public.memberships for update
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
)
with check (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);

drop policy if exists "memberships_delete" on public.memberships;
create policy "memberships_delete" on public.memberships for delete
to authenticated
using (
  public.is_super_admin()
  or org_id in (select public.user_admin_org_ids())
);
