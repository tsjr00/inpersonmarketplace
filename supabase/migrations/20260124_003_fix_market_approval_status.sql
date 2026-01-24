-- Fix existing traditional markets that have NULL approval_status
-- These markets were created by admin before approval_status was being set
-- Traditional markets created by admin should be auto-approved

UPDATE markets
SET approval_status = 'approved'
WHERE market_type = 'traditional'
  AND approval_status IS NULL;

-- Also ensure any admin-created markets (no submitted_by_vendor_id) are approved
UPDATE markets
SET approval_status = 'approved'
WHERE submitted_by_vendor_id IS NULL
  AND approval_status IS NULL;
