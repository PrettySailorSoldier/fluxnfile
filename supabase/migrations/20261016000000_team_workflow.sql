-- ─────────────────────────────────────────────────────────────────────────────
-- Team workflow
--
-- 1. comments: the item Comments section reads/writes this table, but no
--    migration ever created it. Safe to run if it already exists.
-- 2. notifications: inserts were open to any signed-in user for ANY user_id.
--    Now you can only notify yourself or members of your own team.
--    (Edge functions use the service role and are unaffected.)
-- 3. Realtime for items + tasks so a teammate's imports, scans and task
--    changes show up without refreshing.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Comments ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id     UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  text        TEXT NOT NULL,
  mentions    UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_item_id ON public.comments(item_id, created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view comments" ON public.comments;
CREATE POLICY "Team members can view comments"
  ON public.comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.items i WHERE i.id = comments.item_id AND public.is_team_member(i.team_id)
  ));

DROP POLICY IF EXISTS "Team members can add comments" ON public.comments;
CREATE POLICY "Team members can add comments"
  ON public.comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.items i WHERE i.id = comments.item_id AND public.is_team_member(i.team_id)
    )
  );

DROP POLICY IF EXISTS "Authors can delete their comments" ON public.comments;
CREATE POLICY "Authors can delete their comments"
  ON public.comments FOR DELETE
  USING (author_id = auth.uid());

-- 2. Notifications: team-scoped inserts -------------------------------------
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can notify themselves or teammates" ON public.notifications;
CREATE POLICY "Users can notify themselves or teammates"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notifications.user_id
        AND p.team_id IS NOT NULL
        AND p.team_id = public.get_user_team_id()
    )
  );

-- 3. Realtime ----------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['items', 'tasks', 'comments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
