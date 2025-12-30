-- Add tracking_number column to items table
ALTER TABLE public.items
ADD COLUMN tracking_number INTEGER;

-- Create trigger function for auto-generation
CREATE OR REPLACE FUNCTION public.generate_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(tracking_number), 0) + 1
  INTO next_number
  FROM public.items
  WHERE team_id = NEW.team_id;
  
  NEW.tracking_number := next_number;
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_tracking_number
  BEFORE INSERT ON public.items
  FOR EACH ROW
  WHEN (NEW.tracking_number IS NULL)
  EXECUTE FUNCTION public.generate_tracking_number();

-- Backfill existing items
WITH numbered_items AS (
  SELECT 
    id,
    team_id,
    ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at) as row_num
  FROM public.items
  WHERE tracking_number IS NULL
)
UPDATE public.items
SET tracking_number = numbered_items.row_num
FROM numbered_items
WHERE public.items.id = numbered_items.id;

-- Add unique index
CREATE UNIQUE INDEX idx_items_team_tracking_number 
ON public.items (team_id, tracking_number);