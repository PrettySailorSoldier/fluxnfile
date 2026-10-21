-- ─────────────────────────────────────────────────────────────────────────────
-- product_catalog: cache Amazon FNSKU stickers (X00…) and remember the ASIN an
-- Amazon lookup resolved to, so a scanned box can be matched to Amazon orders.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS asin TEXT;

ALTER TABLE public.product_catalog
  DROP CONSTRAINT IF EXISTS product_catalog_code_type_check;
ALTER TABLE public.product_catalog
  ADD CONSTRAINT product_catalog_code_type_check
  CHECK (code_type IN ('upc', 'isbn', 'asin', 'fnsku'));

COMMENT ON COLUMN public.product_catalog.asin IS
  'Amazon ASIN when the product came from an Amazon source (also how FNSKU stickers resolve)';
