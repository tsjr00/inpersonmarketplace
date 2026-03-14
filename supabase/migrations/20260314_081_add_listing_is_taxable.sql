-- Migration 081: Add is_taxable column to listings
-- Allows vendors to mark individual listings as subject to sales tax
-- Used for vendor-side tax tracking/reporting only — platform does NOT collect/remit tax

ALTER TABLE listings ADD COLUMN is_taxable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN listings.is_taxable IS 'Vendor-set flag indicating this item is subject to sales tax. Used for tax reporting, not collection.';
