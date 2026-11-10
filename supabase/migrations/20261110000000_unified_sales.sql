-- ─────────────────────────────────────────────────────────────────────────────
-- One sales ledger for every channel + team sync
--
--  sales +=       channel (market / Facebook Marketplace / eBay / …), buyer_name,
--                 shipping_cost, sale_date (the seller's local calendar day)
--  sale_lines +=  description (things sold that were never in inventory) and the
--                 item's previous fees / shipping / channel, so an undo is exact
--  items +=       listed_at (set by trigger when status becomes 'listed');
--                 channel_sold may now be any channel name
--  record_sale()  one transaction: refuses items that are already sold, so two
--                 partners on two phones can't both sell the same thing
--  undo_sale()    one transaction: items go back exactly as they were
--  realtime       offers, meetups, storage locations and categories, so a
--                 partner working somewhere else sees them change
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columns -------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS channel       TEXT NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS buyer_name    TEXT,
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_date     DATE;

-- Set by the phone for each sale, so a retried (offline-queued) sale is recorded once
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_id ON public.sales(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_team_channel ON public.sales(team_id, channel);

ALTER TABLE public.sale_lines
  ADD COLUMN IF NOT EXISTS description        TEXT,
  ADD COLUMN IF NOT EXISTS prev_recorded      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prev_platform_fees NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS prev_shipping_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS prev_channel_sold  TEXT;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS listed_at TIMESTAMP WITH TIME ZONE;

-- Sales happen in many places; the channel is the platform's name (or 'market').
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_channel_sold_check;

-- 2. listed_at -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_item_listed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'listed' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.listed_at = COALESCE(NEW.listed_at, now());
    ELSIF OLD.status IS DISTINCT FROM 'listed' THEN
      NEW.listed_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_items_listed_at ON public.items;
CREATE TRIGGER set_items_listed_at
  BEFORE INSERT OR UPDATE OF status ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_item_listed_at();

-- Best guess for what is already listed
UPDATE public.items
   SET listed_at = COALESCE(fb_listed_date::timestamptz, updated_at, created_at)
 WHERE status = 'listed' AND listed_at IS NULL;

-- 3. Platforms: the places this team actually sells ------------------------------
INSERT INTO public.platforms (name, fee_percentage, flat_fee, processing_percentage, processing_flat_fee, is_default)
SELECT v.name, v.fee, 0, 0, 0, true
FROM (VALUES
  ('OfferUp', 0::numeric),
  ('Craigslist', 0::numeric),
  ('In person', 0::numeric)
) AS v(name, fee)
WHERE NOT EXISTS (SELECT 1 FROM public.platforms p WHERE p.name = v.name);

-- Local-pickup Marketplace sales carry no selling fee (shipped ones do — enter it on the sale)
UPDATE public.platforms SET fee_percentage = 0
 WHERE name = 'Facebook Marketplace' AND team_id IS NULL AND fee_percentage = 5;

-- 4. record_sale -----------------------------------------------------------------
-- p: { team_id, event_id?, channel, payment_method, discount, tax, fee, shipping,
--      total, bundle_label?, notes?, buyer_name?, sale_date 'YYYY-MM-DD',
--      lines: [{ item_id?, description?, tag_price?, sold_price, fee?, shipping? }] }
CREATE OR REPLACE FUNCTION public.record_sale(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_team    UUID := (p->>'team_id')::uuid;
  v_channel TEXT := COALESCE(NULLIF(p->>'channel', ''), 'market');
  v_date    DATE := COALESCE(NULLIF(p->>'sale_date', '')::date, CURRENT_DATE);
  v_sale    UUID;
  v_line    JSONB;
  v_item    public.items%ROWTYPE;
  v_item_id UUID;
BEGIN
  IF v_team IS NULL OR NOT public.is_team_member(v_team) THEN
    RAISE EXCEPTION 'Not a member of this team';
  END IF;
  IF jsonb_array_length(COALESCE(p->'lines', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nothing to sell';
  END IF;

  -- Already recorded (the first request got through but the answer was lost)
  IF NULLIF(p->>'client_id', '') IS NOT NULL THEN
    SELECT id INTO v_sale FROM public.sales
     WHERE client_id = (p->>'client_id')::uuid AND team_id = v_team;
    IF FOUND THEN
      RETURN v_sale;
    END IF;
  END IF;

  INSERT INTO public.sales (
    team_id, event_id, created_by, payment_method, discount_amount, tax_amount, fee_amount,
    shipping_cost, total, bundle_label, notes, channel, buyer_name, sale_date, client_id
  ) VALUES (
    v_team,
    NULLIF(p->>'event_id', '')::uuid,
    auth.uid(),
    COALESCE(NULLIF(p->>'payment_method', ''), 'cash'),
    COALESCE((p->>'discount')::numeric, 0),
    COALESCE((p->>'tax')::numeric, 0),
    COALESCE((p->>'fee')::numeric, 0),
    COALESCE((p->>'shipping')::numeric, 0),
    COALESCE((p->>'total')::numeric, 0),
    NULLIF(p->>'bundle_label', ''),
    NULLIF(p->>'notes', ''),
    v_channel,
    NULLIF(p->>'buyer_name', ''),
    v_date,
    NULLIF(p->>'client_id', '')::uuid
  ) RETURNING id INTO v_sale;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
    v_item_id := NULLIF(v_line->>'item_id', '')::uuid;

    IF v_item_id IS NULL THEN
      -- Something that was never in inventory (a $2 odd, a handmade piece)
      INSERT INTO public.sale_lines (team_id, sale_id, item_id, description, tag_price, sold_price)
      VALUES (
        v_team, v_sale, NULL, NULLIF(v_line->>'description', ''),
        NULLIF(v_line->>'tag_price', '')::numeric,
        COALESCE((v_line->>'sold_price')::numeric, 0)
      );
      CONTINUE;
    END IF;

    -- Lock the row: a second sale of the same item waits here, then sees it sold
    SELECT * INTO v_item FROM public.items WHERE id = v_item_id AND team_id = v_team FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That item is no longer in inventory';
    END IF;
    IF v_item.status IN ('sold', 'shipped') THEN
      RAISE EXCEPTION 'ALREADY_SOLD: "%" was already sold', COALESCE(left(v_item.title, 60), 'An item');
    END IF;

    INSERT INTO public.sale_lines (
      team_id, sale_id, item_id, tag_price, sold_price,
      prev_status, prev_actual_price, prev_sale_date,
      prev_recorded, prev_platform_fees, prev_shipping_cost, prev_channel_sold
    ) VALUES (
      v_team, v_sale, v_item_id,
      NULLIF(v_line->>'tag_price', '')::numeric,
      COALESCE((v_line->>'sold_price')::numeric, 0),
      v_item.status::text, v_item.actual_price, v_item.sale_date::text,
      true, v_item.platform_fees, v_item.shipping_cost, v_item.channel_sold
    );

    UPDATE public.items SET
      status        = 'sold',
      actual_price  = COALESCE((v_line->>'sold_price')::numeric, 0),
      sale_date     = v_date,
      channel_sold  = v_channel,
      platform_fees = COALESCE(platform_fees, 0) + COALESCE((v_line->>'fee')::numeric, 0),
      shipping_cost = COALESCE(shipping_cost, 0) + COALESCE((v_line->>'shipping')::numeric, 0)
    WHERE id = v_item_id;
  END LOOP;

  RETURN v_sale;
END;
$$;

-- 5. undo_sale -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sale  public.sales%ROWTYPE;
  v_sum   NUMERIC;
  v_line  public.sale_lines%ROWTYPE;
  v_share NUMERIC;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN; -- a partner already undid it
  END IF;
  IF NOT public.is_team_member(v_sale.team_id) THEN
    RAISE EXCEPTION 'Not a member of this team';
  END IF;

  SELECT COALESCE(SUM(sold_price), 0) INTO v_sum FROM public.sale_lines WHERE sale_id = p_sale_id;

  FOR v_line IN SELECT * FROM public.sale_lines WHERE sale_id = p_sale_id LOOP
    CONTINUE WHEN v_line.item_id IS NULL OR v_line.prev_status IS NULL;

    IF v_line.prev_recorded THEN
      UPDATE public.items SET
        status        = v_line.prev_status::public.item_status,
        actual_price  = v_line.prev_actual_price,
        sale_date     = NULLIF(v_line.prev_sale_date, '')::date,
        channel_sold  = v_line.prev_channel_sold,
        platform_fees = v_line.prev_platform_fees,
        shipping_cost = v_line.prev_shipping_cost
      WHERE id = v_line.item_id;
    ELSE
      -- Sales rung up before this migration: take this line's share of the fee back off
      v_share := CASE WHEN v_sum > 0 THEN round(v_sale.fee_amount * v_line.sold_price / v_sum, 2) ELSE 0 END;
      UPDATE public.items SET
        status        = v_line.prev_status::public.item_status,
        actual_price  = v_line.prev_actual_price,
        sale_date     = NULLIF(v_line.prev_sale_date, '')::date,
        channel_sold  = NULL,
        platform_fees = GREATEST(0, COALESCE(platform_fees, 0) - v_share)
      WHERE id = v_line.item_id;
    END IF;
  END LOOP;

  DELETE FROM public.sales WHERE id = p_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_sale(UUID) TO authenticated;

-- 6. Realtime: partners in different places see each other's work ----------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales', 'events', 'items', 'tasks', 'offers', 'meetups', 'storage_locations', 'categories'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
