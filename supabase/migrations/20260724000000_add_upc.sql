-- Product UPC/EAN barcode, learned by scanning: when a product barcode is
-- linked to an item once, future scans of that barcode match instantly.
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS upc TEXT;

COMMENT ON COLUMN public.items.upc IS
  'Product UPC/EAN barcode digits as scanned (matched with leading zeros stripped)';

CREATE INDEX IF NOT EXISTS idx_items_team_upc
ON public.items(team_id, upc)
WHERE upc IS NOT NULL;
