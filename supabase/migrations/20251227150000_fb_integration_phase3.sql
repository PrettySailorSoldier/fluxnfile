-- Phase 3: Facebook Integration Enhancement Migration
-- Features: Offer Tracking, Meetup Management, Safety Check-ins

-- Add coordinates and additional fields to meetup_locations
ALTER TABLE public.meetup_locations
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS is_suggested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS safety_rating INTEGER DEFAULT 5 CHECK (safety_rating >= 1 AND safety_rating <= 5);

-- Create offers table for tracking buyer offers
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  buyer_name TEXT,
  buyer_contact TEXT,
  offer_amount DECIMAL(10, 2) NOT NULL,
  counter_amount DECIMAL(10, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired')),
  is_lowball BOOLEAN DEFAULT false,
  notes TEXT,
  conversation_thread TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create meetups table for scheduling buyer meetups
CREATE TABLE IF NOT EXISTS public.meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  meetup_location_id UUID REFERENCES public.meetup_locations(id) ON DELETE SET NULL,
  custom_location TEXT,
  custom_latitude DECIMAL(10, 8),
  custom_longitude DECIMAL(11, 8),
  scheduled_at TIMESTAMPTZ NOT NULL,
  buyer_name TEXT,
  buyer_contact TEXT,
  agreed_price DECIMAL(10, 2),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled', 'declined')),
  partner_notified BOOLEAN DEFAULT false,
  meeting_started_at TIMESTAMPTZ,
  safe_checkin_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create safety_checkins table for location sharing and check-ins
CREATE TABLE IF NOT EXISTS public.safety_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('meeting_now', 'safe', 'help_needed')),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checkins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for offers
CREATE POLICY "Users can view their team offers"
  ON public.offers FOR SELECT
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can insert offers for their team"
  ON public.offers FOR INSERT
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Users can update their team offers"
  ON public.offers FOR UPDATE
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can delete their team offers"
  ON public.offers FOR DELETE
  USING (public.is_team_member(team_id));

-- RLS Policies for meetups
CREATE POLICY "Users can view their team meetups"
  ON public.meetups FOR SELECT
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can insert meetups for their team"
  ON public.meetups FOR INSERT
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Users can update their team meetups"
  ON public.meetups FOR UPDATE
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can delete their team meetups"
  ON public.meetups FOR DELETE
  USING (public.is_team_member(team_id));

-- RLS Policies for safety_checkins
CREATE POLICY "Users can view their team safety checkins"
  ON public.safety_checkins FOR SELECT
  USING (public.is_team_member(team_id));

CREATE POLICY "Users can insert safety checkins for their team"
  ON public.safety_checkins FOR INSERT
  WITH CHECK (public.is_team_member(team_id));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_offers_item_id ON public.offers(item_id);
CREATE INDEX IF NOT EXISTS idx_offers_team_id ON public.offers(team_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers(status);
CREATE INDEX IF NOT EXISTS idx_meetups_item_id ON public.meetups(item_id);
CREATE INDEX IF NOT EXISTS idx_meetups_team_id ON public.meetups(team_id);
CREATE INDEX IF NOT EXISTS idx_meetups_status ON public.meetups(status);
CREATE INDEX IF NOT EXISTS idx_meetups_scheduled_at ON public.meetups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_safety_checkins_meetup_id ON public.safety_checkins(meetup_id);

-- Insert suggested safe meetup spots (common types)
-- These will be populated with actual locations by users, but we set up location types
INSERT INTO public.meetup_locations (team_id, name, location_type, notes, is_suggested, is_default)
SELECT
  t.id,
  location_name,
  location_type,
  notes,
  true,
  false
FROM public.teams t
CROSS JOIN (
  VALUES
    ('Police Station Lobby', 'police_station', 'Safe exchange zone - 24/7 surveillance'),
    ('Bank Lobby/ATM Area', 'bank', 'Well-lit, cameras, business hours'),
    ('Fire Station', 'fire_station', 'Public area, usually staffed'),
    ('Coffee Shop', 'coffee_shop', 'Public, good for small items'),
    ('Library Entrance', 'library', 'Public area with security')
) AS suggestions(location_name, location_type, notes)
ON CONFLICT DO NOTHING;
