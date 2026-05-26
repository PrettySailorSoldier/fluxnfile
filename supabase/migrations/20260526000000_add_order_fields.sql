-- Add all new fields needed across all import sources
-- Run this in Supabase SQL Editor before deploying the new import features.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS amazon_order_id      TEXT,
  ADD COLUMN IF NOT EXISTS amazon_order_url     TEXT,
  ADD COLUMN IF NOT EXISTS amazon_tracking_url  TEXT,
  ADD COLUMN IF NOT EXISTS amazon_invoice_url   TEXT,
  ADD COLUMN IF NOT EXISTS amazon_shipment_status TEXT,
  ADD COLUMN IF NOT EXISTS amazon_return_status TEXT,
  ADD COLUMN IF NOT EXISTS amazon_refund_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS amazon_refund_date   TEXT,
  ADD COLUMN IF NOT EXISTS amazon_tax_amount    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS is_vine_order        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vine_review_status   TEXT DEFAULT 'not_reviewed',
  ADD COLUMN IF NOT EXISTS vine_review_quality  TEXT,
  ADD COLUMN IF NOT EXISTS vine_review_date     TEXT,
  ADD COLUMN IF NOT EXISTS vine_etv             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS vine_fmv             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS lattice_review_status TEXT,
  ADD COLUMN IF NOT EXISTS lattice_review_score  INTEGER,
  ADD COLUMN IF NOT EXISTS lattice_review_quality TEXT,
  ADD COLUMN IF NOT EXISTS lattice_reviewed_date TEXT,
  ADD COLUMN IF NOT EXISTS data_sources          TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Indexes for the new lookup fields used by the dedup engine and scanner
CREATE INDEX IF NOT EXISTS idx_items_amazon_order_id
  ON public.items(amazon_order_id);

CREATE INDEX IF NOT EXISTS idx_items_is_vine_order
  ON public.items(is_vine_order);

CREATE INDEX IF NOT EXISTS idx_items_vine_review_status
  ON public.items(vine_review_status);

-- vine_review_status constraint: only valid states allowed
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_vine_review_status_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_vine_review_status_check
  CHECK (vine_review_status IS NULL OR vine_review_status IN (
    'not_reviewed', 'pending', 'approved', 'not_approved'
  ));

-- Comments
COMMENT ON COLUMN public.items.amazon_order_id IS
  'Amazon order number (e.g. 113-1234567-1234567) from Order History Extension CSV';

COMMENT ON COLUMN public.items.is_vine_order IS
  'true when total=$0.00 in Order History CSV or imported via Vine HTML';

COMMENT ON COLUMN public.items.data_sources IS
  'Array of import source identifiers: vine_html, lattice_csv, order_history_extension, amazon_csv';

COMMENT ON COLUMN public.items.vine_review_status IS
  'Vine review workflow state: not_reviewed | pending | approved | not_approved';
