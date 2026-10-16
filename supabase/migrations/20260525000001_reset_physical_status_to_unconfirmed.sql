-- Reset all items to unconfirmed — nothing has been physically scanned yet.
-- Only touches rows written by the previous migration's backfill
-- (confirmed_at = created_at, no confirmer), so re-running this against a
-- database that already has real confirmations never wipes them.
UPDATE public.items
SET
  physical_status = 'unconfirmed',
  confirmed_at = NULL,
  confirmed_by = NULL,
  held_by = NULL
WHERE confirmed_by IS NULL
  AND confirmed_at = created_at;
