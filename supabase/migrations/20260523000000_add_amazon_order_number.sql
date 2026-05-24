ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS amazon_order_number TEXT;

CREATE INDEX IF NOT EXISTS idx_items_amazon_order_number
ON public.items(amazon_order_number);
