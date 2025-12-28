-- Add Amazon ASIN field to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS amazon_asin TEXT;

-- Create index for faster ASIN lookups
CREATE INDEX IF NOT EXISTS idx_items_amazon_asin ON public.items(amazon_asin);