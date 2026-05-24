ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS delivery_status TEXT;

COMMENT ON COLUMN public.items.delivery_status IS
  'Delivery status string from Lattice CSV e.g. Delivered, Arriving June 5';
