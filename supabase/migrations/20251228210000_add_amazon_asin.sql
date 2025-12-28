-- Add Amazon ASIN column for duplicate detection
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS amazon_asin TEXT;

-- Create index for efficient duplicate lookups
CREATE INDEX IF NOT EXISTS idx_items_amazon_asin ON public.items(amazon_asin);

-- Add comment for documentation
COMMENT ON COLUMN public.items.amazon_asin IS 'Amazon Standard Identification Number for duplicate detection during import';
