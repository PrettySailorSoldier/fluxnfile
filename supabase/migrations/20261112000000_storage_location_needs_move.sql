-- ─────────────────────────────────────────────────────────────────────────────
-- "Needs moving" flag on storage locations
--
--  storage_locations += needs_move   true for a place things are stored in for
--                                    now but shouldn't stay (boxes in the house
--                                    that belong in the garage, a tote in the car).
--
-- Additive only: existing rows default to false. The hierarchy trigger fires on
-- UPDATE OF parent_id, team_id, so toggling this column doesn't touch it.
-- RLS: the existing team policies on storage_locations already cover the new column.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS needs_move BOOLEAN NOT NULL DEFAULT false;
