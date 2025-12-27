-- Add Facebook tracking fields to items table
ALTER TABLE public.items 
ADD COLUMN fb_listing_url TEXT,
ADD COLUMN fb_views INTEGER DEFAULT 0,
ADD COLUMN fb_listed_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN fb_conversation_notes TEXT,
ADD COLUMN default_pickup_location TEXT;

-- Create message templates table
CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  template_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on message_templates
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_templates
CREATE POLICY "Team members can view templates"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can create templates"
  ON public.message_templates FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update templates"
  ON public.message_templates FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can delete templates"
  ON public.message_templates FOR DELETE
  TO authenticated
  USING (public.is_team_member(team_id));

-- Create meetup_locations table
CREATE TABLE public.meetup_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  location_type TEXT DEFAULT 'meetup',
  notes TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on meetup_locations
ALTER TABLE public.meetup_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies for meetup_locations
CREATE POLICY "Team members can view meetup locations"
  ON public.meetup_locations FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can create meetup locations"
  ON public.meetup_locations FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update meetup locations"
  ON public.meetup_locations FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can delete meetup locations"
  ON public.meetup_locations FOR DELETE
  TO authenticated
  USING (public.is_team_member(team_id));

-- Add trigger for updated_at on message_templates
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default templates
INSERT INTO public.message_templates (team_id, name, category, template_text, is_shared)
SELECT 
  t.id as team_id,
  template.name,
  template.category,
  template.template_text,
  true as is_shared
FROM public.teams t
CROSS JOIN (VALUES
  ('Is Available Response', 'initial', 'Yes! Still available. Are you able to pick up today or tomorrow?'),
  ('Lowball Counter', 'pricing', 'Thanks for your interest! The lowest I can go is $[lowest_price]. Let me know if that works!'),
  ('Price Negotiation', 'pricing', 'I can do $[counter_price] if you can pick up today.'),
  ('Location Info', 'meetup', 'I''m near [location]. I can meet at [meetup_spot]. Does that work for you?'),
  ('Condition Question', 'initial', 'Nothing wrong! [condition_notes]. See all photos for condition.'),
  ('No Delivery', 'meetup', 'I don''t deliver, but I can meet you at a convenient location. Where are you located?'),
  ('Follow Up', 'followup', 'Hi! Just following up - are you still interested in [item_name]? Let me know!'),
  ('No-Show Follow Up', 'followup', 'Hey, I waited at [location] but didn''t see you. Let me know if you still want this - I have other people interested.')
) AS template(name, category, template_text);