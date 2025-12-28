-- Add Amazon review tracking fields to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS amazon_review_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS reviewed_by UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add check constraint for review status values
ALTER TABLE public.items 
ADD CONSTRAINT items_amazon_review_status_check 
CHECK (amazon_review_status IS NULL OR amazon_review_status IN ('pending', 'reviewed_grant', 'reviewed_crybaby', 'reviewed_both'));

-- Create index for filtering by review status
CREATE INDEX IF NOT EXISTS idx_items_amazon_review_status ON public.items(amazon_review_status);