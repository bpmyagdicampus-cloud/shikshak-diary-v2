-- =====================================================================
-- Diary: कक्षा क्रियाकलाप कोड, विशेष कैफियत, मासिक प्रतिवेदनमा समावेश
-- Requires: v2_diary.sql पहिले चलेको। Safe to re-run.
-- =====================================================================
alter table public.diary_entries add column if not exists activities text[] not null default '{}';
alter table public.diary_entries add column if not exists special_remark text not null default '';
alter table public.diary_entries add column if not exists special_in_monthly boolean not null default false;
