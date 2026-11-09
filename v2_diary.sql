-- =====================================================================
-- Task 3: शिक्षकको डायरी (LH अभिलेख)
-- नियम: (क) एउटै दिनमा एउटै कक्षा-विषयमा धेरै प्रविष्टि अनुमति
--       (ख) शिक्षकले आफ्नो डायरी ७ दिनभित्र मात्र थप्न/सच्याउन/मेटाउन सक्छ
--       (ग) भविष्यको मिति अनुमति छैन
-- Requires: v2_task2_rls_hierarchy.sql र v2_setup_foundation.sql पहिले चलेको
-- Safe to re-run.
-- =====================================================================

-- ---------- १. कोलम थप ----------
alter table public.diary_entries add column if not exists org_id uuid references public.organizations (id) on delete cascade;
alter table public.diary_entries add column if not exists unit text not null default '';
alter table public.diary_entries add column if not exists total_students integer not null default 0;
alter table public.diary_entries add column if not exists present_count integer not null default 0;
alter table public.diary_entries add column if not exists absent_count integer not null default 0;
alter table public.diary_entries add column if not exists remarks text not null default '';

-- पुरानो रेकर्डमा org_id भर्ने
update public.diary_entries d set org_id = cs.org_id
from public.class_subjects cs
where cs.id = d.class_subject_id and d.org_id is null;

-- ---------- २. Integrity constraints ----------
alter table public.diary_entries drop constraint if exists diary_lh_range;
alter table public.diary_entries add constraint diary_lh_range check (lh >= 0 and lh <= 12);

alter table public.diary_entries drop constraint if exists diary_counts_nonneg;
alter table public.diary_entries add constraint diary_counts_nonneg
  check (total_students >= 0 and present_count >= 0 and absent_count >= 0);

alter table public.diary_entries drop constraint if exists diary_counts_ok;
alter table public.diary_entries add constraint diary_counts_ok
  check (present_count + absent_count <= total_students);

-- org_id स्वतः (class_subject बाट)
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

-- ---------- ३. RLS: ७ दिनको सीमा ----------
-- entry_date AD मा भण्डारण हुन्छ; current_date - 7 = ७ दिन अघिको मिति
drop policy if exists diary_insert on public.diary_entries;
drop policy if exists diary_update on public.diary_entries;
drop policy if exists diary_delete on public.diary_entries;

create policy diary_insert on public.diary_entries for insert to authenticated
  with check (
    teacher_user_id = auth.uid()
    and public.teaches_class_subject(class_subject_id)
    and entry_date <= current_date
    and entry_date >= current_date - 7
  );

create policy diary_update on public.diary_entries for update to authenticated
  using (
    teacher_user_id = auth.uid()
    and entry_date >= current_date - 7
  )
  with check (
    teacher_user_id = auth.uid()
    and public.teaches_class_subject(class_subject_id)
    and entry_date <= current_date
    and entry_date >= current_date - 7
  );

create policy diary_delete on public.diary_entries for delete to authenticated
  using (
    teacher_user_id = auth.uid()
    and entry_date >= current_date - 7
  );

-- पढ्ने नियम (diary_read) यथावत: लेखक, विभाग प्रमुख, संस्था admin, super admin
