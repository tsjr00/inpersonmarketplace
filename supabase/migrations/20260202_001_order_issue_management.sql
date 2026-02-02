-- Add columns for admin issue management on order_items
-- This allows admins to track and manage buyer-reported issues

-- Add issue_status column (new, in_review, resolved, closed)
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS issue_status TEXT DEFAULT 'new';

-- Add admin notes for the issue
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS issue_admin_notes TEXT;

-- Add resolved tracking
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS issue_resolved_at TIMESTAMPTZ;

ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS issue_resolved_by UUID REFERENCES auth.users(id);

-- Add check constraint for valid issue statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_issue_status_check'
  ) THEN
    ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_issue_status_check
    CHECK (issue_status IN ('new', 'in_review', 'resolved', 'closed'));
  END IF;
END
$$;

-- Create index for querying issues
CREATE INDEX IF NOT EXISTS idx_order_items_issue_reported ON public.order_items(issue_reported_at)
WHERE issue_reported_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_issue_status ON public.order_items(issue_status)
WHERE issue_reported_at IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.order_items.issue_status IS 'Status of buyer-reported issue: new, in_review, resolved, closed';
COMMENT ON COLUMN public.order_items.issue_admin_notes IS 'Internal admin notes about the issue';
COMMENT ON COLUMN public.order_items.issue_resolved_at IS 'When the issue was resolved or closed';
COMMENT ON COLUMN public.order_items.issue_resolved_by IS 'Admin user who resolved the issue';
