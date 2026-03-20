-- =============================================================================
-- Migration 085a: Add role enum values
-- =============================================================================
-- Created: 2026-03-16 (split from 085 on 2026-03-20)
-- Author: Claude Code
--
-- IMPORTANT: Must be run and committed BEFORE 085b.
-- PostgreSQL requires ALTER TYPE ADD VALUE to commit before new values can be used.
-- =============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'regional_admin';
