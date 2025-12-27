-- Add created_by column to track team creator
ALTER TABLE public.teams 
ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update the SELECT policy to also allow the creator to view the team
DROP POLICY IF EXISTS "Users can view their team" ON public.teams;

CREATE POLICY "Users can view their team"
  ON public.teams FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(id) 
    OR created_by = auth.uid()
  );

-- Update INSERT policy to require created_by to be set
DROP POLICY IF EXISTS "Users can create teams" ON public.teams;

CREATE POLICY "Users can create teams"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());