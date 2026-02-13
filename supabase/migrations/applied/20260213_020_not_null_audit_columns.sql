-- Migration 020: Add NOT NULL constraints and defaults to audit columns
--
-- Several tables have nullable created_at/updated_at columns, some without
-- defaults. This ensures every row has a timestamp.

-- orders: nullable with no default (critical)
ALTER TABLE public.orders
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.orders SET created_at = now() WHERE created_at IS NULL;
UPDATE public.orders SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- order_items: nullable with no default (critical)
ALTER TABLE public.order_items
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.order_items SET created_at = now() WHERE created_at IS NULL;
UPDATE public.order_items SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.order_items
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- admin_activity_log: nullable with default now()
UPDATE public.admin_activity_log SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.admin_activity_log ALTER COLUMN created_at SET NOT NULL;

-- error_logs: nullable with default now()
UPDATE public.error_logs SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.error_logs ALTER COLUMN created_at SET NOT NULL;

-- error_reports: nullable with default now()
UPDATE public.error_reports SET created_at = now() WHERE created_at IS NULL;
UPDATE public.error_reports SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.error_reports ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.error_reports ALTER COLUMN updated_at SET NOT NULL;
