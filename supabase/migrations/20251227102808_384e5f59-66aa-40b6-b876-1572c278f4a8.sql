-- Create a security definer function to verify a team exists (bypasses RLS for joining)
CREATE OR REPLACE FUNCTION public.verify_team_exists(team_uuid uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name
  FROM public.teams t
  WHERE t.id = team_uuid;
END;
$$;