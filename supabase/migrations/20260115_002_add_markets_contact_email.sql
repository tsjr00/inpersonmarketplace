-- Migration: Add contact_email column to markets table
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Fix market creation/edit - code expects contact_email column

-- Add contact_email column
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Add comment
COMMENT ON COLUMN markets.contact_email IS 'Primary contact email for market inquiries';

-- Migration applied successfully
