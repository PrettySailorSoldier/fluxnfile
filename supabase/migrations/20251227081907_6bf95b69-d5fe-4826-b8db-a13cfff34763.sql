-- Create enums
CREATE TYPE public.item_status AS ENUM ('acquired', 'refurbishing', 'ready_to_list', 'listed', 'sold', 'shipped');
CREATE TYPE public.item_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');

-- Teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Platform fee presets table
CREATE TABLE public.platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee_percentage DECIMAL(5, 2) DEFAULT 0,
  flat_fee DECIMAL(10, 2) DEFAULT 0,
  processing_percentage DECIMAL(5, 2) DEFAULT 0,
  processing_flat_fee DECIMAL(10, 2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

-- Storage locations table
CREATE TABLE public.storage_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

-- Items table (main inventory)
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Basic info
  title TEXT,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Acquisition
  original_cost DECIMAL(10, 2) NOT NULL,
  acquisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  acquisition_source TEXT,
  
  -- Condition
  condition item_condition NOT NULL DEFAULT 'good',
  refurbish_notes TEXT,
  refurbish_cost DECIMAL(10, 2) DEFAULT 0,
  time_invested_minutes INTEGER DEFAULT 0,
  
  -- Location
  storage_location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  
  -- Selling
  status item_status NOT NULL DEFAULT 'acquired',
  target_price DECIMAL(10, 2),
  actual_price DECIMAL(10, 2),
  sale_date DATE,
  
  -- Shipping
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  
  -- Platform info
  platform_fees DECIMAL(10, 2) DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Item listings table (track where items are listed)
CREATE TABLE public.item_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE NOT NULL,
  platform_id UUID REFERENCES public.platforms(id) ON DELETE SET NULL,
  listing_url TEXT,
  listed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sold_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE public.item_listings ENABLE ROW LEVEL SECURITY;

-- Insert default platforms (system-wide defaults)
INSERT INTO public.platforms (name, fee_percentage, flat_fee, processing_percentage, processing_flat_fee, is_default) VALUES
  ('eBay', 13.25, 0.30, 0, 0, true),
  ('Mercari', 10, 0, 2.9, 0.30, true),
  ('Poshmark', 20, 0, 0, 0, true),
  ('Facebook Marketplace', 5, 0, 0, 0, true),
  ('Other', 0, 0, 0, 0, true);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to check if user is team member
CREATE OR REPLACE FUNCTION public.is_team_member(team_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND team_id = team_uuid
  )
$$;

-- Function to get user's team_id
CREATE OR REPLACE FUNCTION public.get_user_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

-- RLS Policies

-- Teams: users can only see their own team
CREATE POLICY "Users can view their team"
  ON public.teams FOR SELECT
  TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "Users can update their team"
  ON public.teams FOR UPDATE
  TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Profiles: users can view/update their own and team members
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR team_id = public.get_user_team_id());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Categories: team members can CRUD
CREATE POLICY "Team members can view categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can create categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can delete categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_team_member(team_id));

-- Platforms: users can see defaults + team customs
CREATE POLICY "Users can view platforms"
  ON public.platforms FOR SELECT
  TO authenticated
  USING (is_default = true OR team_id = public.get_user_team_id());

CREATE POLICY "Team members can create platforms"
  ON public.platforms FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update platforms"
  ON public.platforms FOR UPDATE
  TO authenticated
  USING (is_default = false AND team_id = public.get_user_team_id());

CREATE POLICY "Team members can delete platforms"
  ON public.platforms FOR DELETE
  TO authenticated
  USING (is_default = false AND team_id = public.get_user_team_id());

-- Storage locations: team members can CRUD
CREATE POLICY "Team members can view storage locations"
  ON public.storage_locations FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can create storage locations"
  ON public.storage_locations FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update storage locations"
  ON public.storage_locations FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can delete storage locations"
  ON public.storage_locations FOR DELETE
  TO authenticated
  USING (public.is_team_member(team_id));

-- Items: team members can CRUD
CREATE POLICY "Team members can view items"
  ON public.items FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can create items"
  ON public.items FOR INSERT
  TO authenticated
  WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "Team members can update items"
  ON public.items FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can delete items"
  ON public.items FOR DELETE
  TO authenticated
  USING (public.is_team_member(team_id));

-- Item listings: based on parent item access
CREATE POLICY "Team members can view item listings"
  ON public.item_listings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_listings.item_id
        AND public.is_team_member(items.team_id)
    )
  );

CREATE POLICY "Team members can create item listings"
  ON public.item_listings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_listings.item_id
        AND public.is_team_member(items.team_id)
    )
  );

CREATE POLICY "Team members can update item listings"
  ON public.item_listings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_listings.item_id
        AND public.is_team_member(items.team_id)
    )
  );

CREATE POLICY "Team members can delete item listings"
  ON public.item_listings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_listings.item_id
        AND public.is_team_member(items.team_id)
    )
  );

-- Create storage bucket for item photos
INSERT INTO storage.buckets (id, name, public) VALUES ('item-photos', 'item-photos', true);

-- Storage policies for item photos
CREATE POLICY "Anyone can view item photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'item-photos');

CREATE POLICY "Authenticated users can upload item photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'item-photos');

CREATE POLICY "Authenticated users can update item photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'item-photos');

CREATE POLICY "Authenticated users can delete item photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'item-photos');