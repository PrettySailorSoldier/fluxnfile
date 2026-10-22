-- ─────────────────────────────────────────────────────────────────────────────
-- items.ordered_date / shipped_date / delivered_date: the dates printed in the
-- official order files (Lattice export, Vine Itemized Report, Amazon order
-- history), kept as-is so a scanned box can be checked against its order.
-- acquisition_date stays the app's own "when we got it" date. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS ordered_date   DATE,
  ADD COLUMN IF NOT EXISTS shipped_date   DATE,
  ADD COLUMN IF NOT EXISTS delivered_date DATE;

COMMENT ON COLUMN public.items.ordered_date IS 'Order date from the imported order file';
COMMENT ON COLUMN public.items.shipped_date IS 'Shipped date from the imported order file';
COMMENT ON COLUMN public.items.delivered_date IS 'Delivered date from the imported order file';
