-- Add physical inventory tracking
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS physical_status TEXT NOT NULL DEFAULT 'unconfirmed',
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS held_by UUID REFERENCES auth.users(id);

-- Constrain valid values
ALTER TABLE public.items
ADD CONSTRAINT items_physical_status_check
CHECK (physical_status IN ('unconfirmed', 'keep', 'sell'));

-- Index for filtering by physical status
CREATE INDEX IF NOT EXISTS idx_items_physical_status
ON public.items(physical_status);

-- Backfill: items that already have a status beyond 'acquired'
-- are considered already confirmed on hand
UPDATE public.items
SET
  physical_status = 'sell',
  confirmed_at = created_at
WHERE status IN ('refurbishing', 'ready_to_list', 'listed', 'sold', 'shipped');
