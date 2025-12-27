-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view teams for joining or membership" ON public.teams;

-- Create a more secure policy:
-- Users can view teams they're members of, created, OR explicitly query by ID
CREATE POLICY "Users can view their team"
ON public.teams
FOR SELECT
USING (
  is_team_member(id) 
  OR created_by = auth.uid()
);

-- Note: For joining, we'll handle this in the application by having the join function
-- use a security definer function or update the profile first