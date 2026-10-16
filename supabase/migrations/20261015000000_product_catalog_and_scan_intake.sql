-- ─────────────────────────────────────────────────────────────────────────────
-- Scan intake upgrade
--
-- 1. product_catalog: shared cache of barcode lookups (UPC / EAN / ISBN / ASIN).
--    Every barcode costs at most ONE external API call, ever. Written only by
--    the lookup-upc edge function (service role); readable by signed-in users.
-- 2. items.brand / items.retail_price: autofilled from the catalog on scan or
--    list import so pricing suggestions have something to work from.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_catalog (
  -- Normalized code: digits with leading zeros stripped for UPC/EAN/ISBN-13,
  -- uppercase for ASIN / ISBN-10.
  code            TEXT PRIMARY KEY,
  code_type       TEXT NOT NULL CHECK (code_type IN ('upc', 'isbn', 'asin')),
  found           BOOLEAN NOT NULL DEFAULT false,
  title           TEXT,
  brand           TEXT,
  model           TEXT,
  description     TEXT,
  category        TEXT,
  image_url       TEXT,
  images          TEXT[] DEFAULT ARRAY[]::TEXT[],
  lowest_price    DECIMAL(10, 2),
  highest_price   DECIMAL(10, 2),
  retail_price    DECIMAL(10, 2),
  source          TEXT,
  raw             JSONB,
  fetched_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_catalog IS
  'Cache of barcode → product lookups. Negative results (found=false) are retried after 14 days.';

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read the product catalog" ON public.product_catalog;
CREATE POLICY "Signed-in users can read the product catalog"
  ON public.product_catalog FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE policies on purpose: only the edge function (service role) writes.

-- Autofilled product details on items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS brand        TEXT,
  ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2);

COMMENT ON COLUMN public.items.brand IS 'Brand, autofilled from barcode lookup or list import';
COMMENT ON COLUMN public.items.retail_price IS
  'New/retail price from barcode lookup or list import — basis for suggested resale price';

-- Fast barcode matching during scan sessions
CREATE INDEX IF NOT EXISTS idx_items_team_asin
  ON public.items(team_id, amazon_asin)
  WHERE amazon_asin IS NOT NULL;
