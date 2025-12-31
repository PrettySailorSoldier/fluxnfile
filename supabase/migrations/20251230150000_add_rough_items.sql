-- Create rough_items table for quick inventory notes
-- These are rough notes about items in boxes that will later be converted to real inventory items

CREATE TABLE public.rough_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Box/container info
  box_label TEXT NOT NULL,
  box_description TEXT,

  -- Item info (rough notes)
  item_name TEXT NOT NULL,
  item_notes TEXT,
  estimated_quantity INTEGER DEFAULT 1,
  estimated_value DECIMAL(10,2),

  -- Status tracking
  is_processed BOOLEAN DEFAULT FALSE,
  linked_item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Add RLS policies
ALTER TABLE public.rough_items ENABLE ROW LEVEL SECURITY;

-- Team members can view rough items for their team
CREATE POLICY "Team members can view rough items"
  ON public.rough_items
  FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Team members can insert rough items for their team
CREATE POLICY "Team members can insert rough items"
  ON public.rough_items
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Team members can update rough items for their team
CREATE POLICY "Team members can update rough items"
  ON public.rough_items
  FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Team members can delete rough items for their team
CREATE POLICY "Team members can delete rough items"
  ON public.rough_items
  FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX idx_rough_items_team_id ON public.rough_items(team_id);
CREATE INDEX idx_rough_items_is_processed ON public.rough_items(is_processed);
CREATE INDEX idx_rough_items_box_label ON public.rough_items(box_label);

-- Add trigger for updated_at
CREATE TRIGGER update_rough_items_updated_at
  BEFORE UPDATE ON public.rough_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.rough_items IS 'Rough inventory notes for items in boxes that will later be converted to real inventory items';
COMMENT ON COLUMN public.rough_items.box_label IS 'Label written on the box (e.g., "Box A", "Kitchen Stuff")';
COMMENT ON COLUMN public.rough_items.item_name IS 'Quick name/description of the item';
COMMENT ON COLUMN public.rough_items.is_processed IS 'Whether this rough item has been converted to a real inventory item';
COMMENT ON COLUMN public.rough_items.linked_item_id IS 'Reference to the real inventory item if this rough item was converted';
