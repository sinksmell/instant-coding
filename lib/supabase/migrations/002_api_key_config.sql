-- Migration 002: Support ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL dual config
-- Created at: 2026-04-26
-- Applies: if you have api_key_encrypted column from 000_init or 001_remove_paywall

-- Rename old column (preserves existing data)
ALTER TABLE users RENAME COLUMN api_key_encrypted TO anthropic_api_key_encrypted;

-- Add optional base_url column
ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_base_url TEXT;
