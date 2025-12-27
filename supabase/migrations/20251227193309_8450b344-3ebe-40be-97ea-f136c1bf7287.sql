-- Create offers table
CREATE TABLE public.offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  buyer_name TEXT,
  buyer_contact TEXT,
  offer_amount NUMERIC NOT NULL,
  counter_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired')),
  is_lowball BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  conversation_thread TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meetups table
CREATE TABLE public.meetups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  meetup_location_id UUID REFERENCES public.meetup_locations(id) ON DELETE SET NULL,
  custom_location TEXT,
  custom_latitude NUMERIC,
  custom_longitude NUMERIC,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  buyer_name TEXT,
  buyer_contact TEXT,
  agreed_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled', 'declined')),
  partner_notified BOOLEAN NOT NULL DEFAULT false,
  meeting_started_at TIMESTAMP WITH TIME ZONE,
  safe_checkin_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create safety_checkins table
CREATE TABLE public.safety_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meetup_id UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('meeting_now', 'safe', 'help_needed')),
  latitude NUMERIC,
  longitude NUMERIC,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add latitude/longitude to meetup_locations if not exists
ALTER TABLE public.meetup_locations 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Enable RLS on all tables
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checkins ENABLE ROW LEVEL SECURITY;

-- RLS policies for offers
CREATE POLICY "Team members can view offers" ON public.offers
  FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team members can create offers" ON public.offers
  FOR INSERT WITH CHECK (team_id = get_user_team_id());

CREATE POLICY "Team members can update offers" ON public.offers
  FOR UPDATE USING (is_team_member(team_id));

CREATE POLICY "Team members can delete offers" ON public.offers
  FOR DELETE USING (is_team_member(team_id));

-- RLS policies for meetups
CREATE POLICY "Team members can view meetups" ON public.meetups
  FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team members can create meetups" ON public.meetups
  FOR INSERT WITH CHECK (team_id = get_user_team_id());

CREATE POLICY "Team members can update meetups" ON public.meetups
  FOR UPDATE USING (is_team_member(team_id));

CREATE POLICY "Team members can delete meetups" ON public.meetups
  FOR DELETE USING (is_team_member(team_id));

-- RLS policies for safety_checkins
CREATE POLICY "Team members can view safety checkins" ON public.safety_checkins
  FOR SELECT USING (is_team_member(team_id));

CREATE POLICY "Team members can create safety checkins" ON public.safety_checkins
  FOR INSERT WITH CHECK (team_id = get_user_team_id());

CREATE POLICY "Team members can delete safety checkins" ON public.safety_checkins
  FOR DELETE USING (is_team_member(team_id));