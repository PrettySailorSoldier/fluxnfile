-- Reset all items to unconfirmed — nothing has been physically scanned yet
UPDATE public.items
SET
  physical_status = 'unconfirmed',
  confirmed_at = NULL,
  confirmed_by = NULL,
  held_by = NULL;
