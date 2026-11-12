-- ─────────────────────────────────────────────────────────────────────────────
-- Nested storage locations
--
--  storage_locations += parent_id   a location can sit inside another one:
--                                   Workshop › Bottom shelf › Right › Bin 3
--
--  * Max depth 4 (a top-level place is depth 1).
--  * Sibling names are unique per team + parent, ignoring case.
--  * items.storage_location_id still points at one row; it may be a leaf
--    ("Bin 3") or a parent ("somewhere in the Workshop").
--  * Existing rows become top-level locations, untouched — except that a
--    team's case-insensitive duplicate names ("Garage" + "garage") get a
--    " (2)" suffix on the newer row so the unique index can be built.
--  * Deleting a location deletes the locations inside it (ON DELETE CASCADE);
--    items in any of them keep working with no location (ON DELETE SET NULL,
--    unchanged).
--
-- RLS: the four existing team policies on storage_locations already cover the
-- new column; nothing is changed or weakened here.
-- Safe to re-run: IF NOT EXISTS / OR REPLACE / DROP TRIGGER IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Column + lookup index ------------------------------------------------------
ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES public.storage_locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_storage_locations_team_parent
  ON public.storage_locations(team_id, parent_id);

-- 2. Sibling names unique (case-insensitive) ------------------------------------
-- Rename later case-insensitive duplicates first, or the index can't be built.
-- A no-op once the index exists (it prevents new duplicates).
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT id, team_id, parent_id, name
    FROM (
      SELECT id, team_id, parent_id, name,
             row_number() OVER (
               PARTITION BY team_id,
                            coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            lower(name)
               ORDER BY created_at, id
             ) AS rn
      FROM public.storage_locations
    ) d
    WHERE d.rn > 1
  LOOP
    n := 2;
    LOOP
      candidate := r.name || ' (' || n || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.storage_locations s
        WHERE s.team_id = r.team_id
          AND s.parent_id IS NOT DISTINCT FROM r.parent_id
          AND lower(s.name) = lower(candidate)
      );
      n := n + 1;
    END LOOP;
    RAISE NOTICE 'storage_locations: renaming duplicate "%" (%) to "%"', r.name, r.id, candidate;
    UPDATE public.storage_locations SET name = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_locations_sibling_name
  ON public.storage_locations (
    team_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- 3. Tree guard -------------------------------------------------------------------
-- Rejects: parent = self, parent missing / in another team, cycles,
-- depth > 4 (counting the subtree being moved), and moving a location that has
-- children to another team.
CREATE OR REPLACE FUNCTION public.check_storage_location_tree()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  max_depth CONSTANT INT := 4;
  parent_team UUID;
  parent_depth INT;
  subtree_height INT := 0;
  hits_self BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.team_id IS DISTINCT FROM OLD.team_id
     AND EXISTS (SELECT 1 FROM public.storage_locations c WHERE c.parent_id = NEW.id) THEN
    RAISE EXCEPTION 'A location with spots inside it can''t move to another team'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NULL THEN
    -- Top level: only the subtree below can be too deep.
    parent_depth := 0;
  ELSE
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A location can''t be inside itself'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT team_id INTO parent_team FROM public.storage_locations WHERE id = NEW.parent_id;
    IF parent_team IS NULL THEN
      RAISE EXCEPTION 'That parent location no longer exists'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF parent_team <> NEW.team_id THEN
      RAISE EXCEPTION 'A location''s parent must belong to the same team'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Walk up from the new parent: its depth, and whether we pass through NEW.
    WITH RECURSIVE up AS (
      SELECT id, parent_id, 1 AS lvl
      FROM public.storage_locations WHERE id = NEW.parent_id
      UNION ALL
      SELECT s.id, s.parent_id, up.lvl + 1
      FROM public.storage_locations s
      JOIN up ON s.id = up.parent_id
      WHERE up.lvl < 64
    )
    SELECT max(lvl), bool_or(id = NEW.id) INTO parent_depth, hits_self FROM up;

    IF hits_self THEN
      RAISE EXCEPTION 'Can''t move a location inside one of its own spots'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- How many levels sit below NEW (0 for a leaf or a new row).
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE down AS (
      SELECT id, 1 AS lvl
      FROM public.storage_locations WHERE parent_id = NEW.id
      UNION ALL
      SELECT s.id, down.lvl + 1
      FROM public.storage_locations s
      JOIN down ON s.parent_id = down.id
      WHERE down.lvl < 64
    )
    SELECT coalesce(max(lvl), 0) INTO subtree_height FROM down;
  END IF;

  IF parent_depth + 1 + subtree_height > max_depth THEN
    RAISE EXCEPTION 'Locations can be nested at most % levels deep', max_depth
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_locations_tree_guard ON public.storage_locations;
CREATE TRIGGER storage_locations_tree_guard
  BEFORE INSERT OR UPDATE OF parent_id, team_id ON public.storage_locations
  FOR EACH ROW EXECUTE FUNCTION public.check_storage_location_tree();

NOTIFY pgrst, 'reload schema';
