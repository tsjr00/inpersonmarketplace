-- =============================================================================
-- Migration: Add contact and location fields to markets table
-- =============================================================================
-- Created: 2026-01-18
-- Author: Claude Code
--
-- Purpose:
-- Add contact_email, contact_phone, latitude, and longitude fields to markets
-- table for the market referral feature and geographic filtering.
--
-- Applied to:
-- [x] Dev - Date: 2026-01-18
-- [x] Staging - Date: 2026-01-18
-- =============================================================================

-- Contact fields for market referral feature
ALTER TABLE markets ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS contact_phone TEXT;

COMMENT ON COLUMN markets.contact_email IS 'Market contact email (from vendor referral or admin entry)';
COMMENT ON COLUMN markets.contact_phone IS 'Market contact phone (from vendor referral or admin entry)';

-- Location fields for geographic filtering
ALTER TABLE markets ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

CREATE INDEX IF NOT EXISTS idx_markets_location ON markets(latitude, longitude) WHERE latitude IS NOT NULL;

COMMENT ON COLUMN markets.latitude IS 'Market latitude for geographic filtering';
COMMENT ON COLUMN markets.longitude IS 'Market longitude for geographic filtering';
