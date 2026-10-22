-- ─────────────────────────────────────────────────────────────────────────────
-- items.fnsku: the Amazon X00… sticker on a box. Saved when a scanned sticker is
-- matched to an item, so the next scan of that sticker (Add or Find mode)
-- matches without any Amazon lookup. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS fnsku TEXT;

COMMENT ON COLUMN public.items.fnsku IS
  'Amazon FNSKU sticker code (X00…) scanned on this item''s box';

CREATE INDEX IF NOT EXISTS idx_items_team_fnsku
  ON public.items(team_id, fnsku)
  WHERE fnsku IS NOT NULL;
