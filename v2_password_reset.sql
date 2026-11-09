-- =====================================================================
-- पासवर्ड रिसेट: पहिलो लगइनमा नयाँ पासवर्ड अनिवार्य
-- चलाउने ठाउँ: v2 STAGING SQL Editor। Safe to re-run.
-- =====================================================================
alter table public.profiles add column if not exists must_change_password boolean not null default false;

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'archive', 'restore', 'delete', 'password_reset'));
