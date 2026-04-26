-- Migration 001: Remove paywall fields (switch to fully free model)
-- Created at: 2026-04-26
-- Applies: if you have plan/task_count_month columns from 000_init

-- Remove paid-tier columns
ALTER TABLE users DROP COLUMN IF EXISTS plan;
ALTER TABLE users DROP COLUMN IF EXISTS task_count_month;
