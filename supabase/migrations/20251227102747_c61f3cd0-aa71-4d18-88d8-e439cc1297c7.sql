-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their team" ON public.teams;

-- Create a new policy that allows:
-- 1. Team members to view their team
-- 2. Anyone authenticated to view a team by ID (needed for joining)
CREATE POLICY "Users can view teams for joining or membership"
ON public.teams
FOR SELECT
USING (
  is_team_member(id) 
  OR created_by = auth.uid()
  OR auth.uid() IS NOT NULL  -- Allow any authenticated user to view teams (for join flow)
);