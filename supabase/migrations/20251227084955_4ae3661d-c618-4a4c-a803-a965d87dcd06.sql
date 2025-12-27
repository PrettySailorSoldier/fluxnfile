-- Create task_type enum
CREATE TYPE public.task_type AS ENUM (
  'needs_photos',
  'needs_cleaning',
  'needs_pricing',
  'ready_to_list',
  'needs_packaging',
  'ready_to_ship',
  'meetup_scheduled',
  'needs_discussion'
);

-- Create task_status enum
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  task_type task_type NOT NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status task_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  deadline TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for tasks
CREATE POLICY "Team members can view tasks"
ON public.tasks FOR SELECT
USING (is_team_member(team_id));

CREATE POLICY "Team members can create tasks"
ON public.tasks FOR INSERT
WITH CHECK (team_id = get_user_team_id());

CREATE POLICY "Team members can update tasks"
ON public.tasks FOR UPDATE
USING (is_team_member(team_id));

CREATE POLICY "Team members can delete tasks"
ON public.tasks FOR DELETE
USING (is_team_member(team_id));

-- Create user_preferences table for theme customization
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  background_image_url TEXT,
  primary_color TEXT,
  accent_color TEXT,
  text_color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_preferences
CREATE POLICY "Users can view own preferences"
ON public.user_preferences FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
ON public.user_preferences FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
ON public.user_preferences FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own preferences"
ON public.user_preferences FOR DELETE
USING (user_id = auth.uid());

-- Add trigger for updated_at on tasks
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on user_preferences
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();