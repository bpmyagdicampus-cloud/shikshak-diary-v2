-- =====================================================================
-- Diary: शिक्षण विधि, विद्यार्थी क्रियाकलाप, विद्यार्थी पृष्ठपोषण, मूल्याङ्कन
-- Requires: v2_diary_extra.sql पहिले चलेको। Safe to re-run.
-- =====================================================================
alter table public.diary_entries add column if not exists methods text not null default '';
alter table public.diary_entries add column if not exists student_activities text not null default '';
alter table public.diary_entries add column if not exists student_feedback text not null default '';
alter table public.diary_entries add column if not exists evaluation_done text not null default '';
