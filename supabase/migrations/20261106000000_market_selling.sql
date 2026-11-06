-- ─────────────────────────────────────────────────────────────────────────────
-- Market-day selling (flea markets, swap meets, craft fairs)
--
--  events          one market day: booth fee, costs, hours, cash float, review
--  sales           a real transaction: payment type, discount, tax, card fee
--  sale_lines      one row per item in a sale: tag price and what it sold for
--  markdown_phases per-event price steps through the day (percent off tag)
--  bundle_rules    "any 3 from the $5 tier for $10"
--  items +=        tag_price, floor_price, packed_for_event_id, channel_sold,
--                  market_attempts
--
-- items.actual_price / sale_date / status are still written when a sale
-- completes, so Analytics, Sales Check and the profit maths keep working.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Events -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id       UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  event_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  location      TEXT,
  booth_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_costs   NUMERIC(10,2) NOT NULL DEFAULT 0,   -- gas, supplies, parking
  mileage_miles NUMERIC(8,1),
  start_time    TEXT,                               -- 'HH:MM' (local)
  end_time      TEXT,
  weather       TEXT,
  start_cash    NUMERIC(10,2) NOT NULL DEFAULT 0,
  counted_cash  NUMERIC(10,2),                      -- cash in the box at close
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'open', 'closed')),
  verdict       TEXT CHECK (verdict IN ('book_again', 'maybe', 'skip')),
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_team_date ON public.events(team_id, event_date DESC);

-- 2. Sales + lines ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id         UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sold_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payment_method  TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'venmo', 'other')),
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0, -- tag total minus what was charged (before tax)
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_amount      NUMERIC(10,2) NOT NULL DEFAULT 0, -- card / app processing fee
  total           NUMERIC(10,2) NOT NULL,           -- charged to the buyer, tax included
  bundle_label    TEXT,
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_event ON public.sales(event_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_team_sold ON public.sales(team_id, sold_at DESC);

CREATE TABLE IF NOT EXISTS public.sale_lines (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sale_id      UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  item_id      UUID REFERENCES public.items(id) ON DELETE SET NULL,
  tag_price    NUMERIC(10,2),
  sold_price   NUMERIC(10,2) NOT NULL,
  prev_status  TEXT,                                -- restored when a sale is undone
  prev_actual_price NUMERIC(10,2),
  prev_sale_date    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON public.sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_item ON public.sale_lines(item_id);

-- 3. Markdown phases + bundle rules -------------------------------------------
CREATE TABLE IF NOT EXISTS public.markdown_phases (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,                        -- 'HH:MM' (local)
  percent_off NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent_off >= 0 AND percent_off <= 90)
);

CREATE INDEX IF NOT EXISTS idx_markdown_phases_event ON public.markdown_phases(event_id);

CREATE TABLE IF NOT EXISTS public.bundle_rules (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id        UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  max_item_price NUMERIC(10,2),                     -- tier: items tagged at or under this
  category_id    UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  quantity       INTEGER NOT NULL CHECK (quantity >= 2),
  bundle_price   NUMERIC(10,2) NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Item additions -----------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS tag_price           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS floor_price         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS packed_for_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_sold        TEXT,
  ADD COLUMN IF NOT EXISTS market_attempts     INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_channel_sold_check') THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_channel_sold_check CHECK (channel_sold IS NULL OR channel_sold IN ('market', 'online'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_packed_event ON public.items(packed_for_event_id) WHERE packed_for_event_id IS NOT NULL;

COMMENT ON COLUMN public.items.tag_price IS 'Price on the sticker at a market (target + haggle buffer)';
COMMENT ON COLUMN public.items.floor_price IS 'Private walk-away price — never printed on tags';

-- 5. Platforms: in-person channel --------------------------------------------
INSERT INTO public.platforms (name, fee_percentage, flat_fee, processing_percentage, processing_flat_fee, is_default)
SELECT 'Flea market', 0, 0, 0, 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.platforms WHERE name = 'Flea market');

-- 6. RLS ------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'sales', 'sale_lines', 'markdown_phases', 'bundle_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team members can view %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Team members can view %1$s" ON public.%1$I FOR SELECT USING (public.is_team_member(team_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team members can insert %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Team members can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_team_member(team_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team members can update %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Team members can update %1$s" ON public.%1$I FOR UPDATE USING (public.is_team_member(team_id))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Team members can delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Team members can delete %1$s" ON public.%1$I FOR DELETE USING (public.is_team_member(team_id))', t);
  END LOOP;
END $$;

-- 7. updated_at on events -------------------------------------------------------
DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Realtime: a partner sees sales ring up live -----------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales', 'events'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
