# Scan & intake upgrade (Oct 2026)

Goal: **scan → autofill → sort/fill in**, or **upload a list → everything filled in**, then track, organize and sell.

## What changed

| Area | Files | What it does |
|---|---|---|
| Scan session (new) | `src/pages/ScanSession.tsx`, `src/hooks/useContinuousScanner.ts`, `src/lib/scanIntake.ts` | Full-screen `/scan` page. Camera stays on and you scan item after item. **Add mode:** Order Sheet items are received, items you already have are flagged (no double counting), unknown barcodes are looked up and created with title/photo/brand/category/suggested price, and scanning the same product again adds another unit. **Find mode:** shows where an item is and opens Quick Edit. Session defaults: keep/sell, location, condition, cost, source, % of retail. Every row has Undo / Edit / +1 unit, and new items have "Wrong item? Link". Works with typed codes and Bluetooth/USB scanner guns. Has a flashlight toggle (Android) and beeps + haptics per result. |
| Product lookup | `supabase/functions/lookup-upc/index.ts`, `src/lib/productLookup.ts` | Returns title, brand, model, description, category, images and a price range. Sources: UPCitemdb → Open Food Facts (groceries/beauty); ISBN → Open Library; ASIN → OpenWeb Ninja (if a key is set). Results are cached in `product_catalog`, so each barcode costs one API call ever. Has a batch mode for list imports. Old `{ upc }` requests still work. |
| Barcodes | `src/lib/barcode.ts`, `src/hooks/useBarcodeScanner.ts` | UPC-E expands to UPC-A, EAN-8 and ISBN-10 (incl. X) are supported, and the scanner is limited to product barcode formats with the rear camera forced. |
| List import (new) | `src/components/inventory/ListImportDialog.tsx`, `src/utils/generic-list-parser.ts` | Imports any CSV/TSV/Excel file or pasted rows. Finds the header row even under title rows and auto-maps ~19 fields (remembers your mapping per file layout). Quantity creates one row per unit. Barcodes are looked up to fill blanks. Missing categories/locations are created. Matching items (by barcode/ASIN) get blanks filled instead of being duplicated. You choose the destination: Order Sheet / Inventory·Sell / Inventory·Keep. It's under **Import → Any list** on Inventory and Order Sheet. |
| Organizing | `src/pages/Inventory.tsx`, `src/components/inventory/BulkEditDialog.tsx`, `src/hooks/useInventory.ts` | **Needs details** queue (missing title/price/photo/category) with Save & next. New sorts: most profit, best margin, highest price, oldest unsold, by location. New filters: location, keep/sell. Search also covers brand, location, UPC, ASIN and #tracking number. Bulk edit covers status, keep/sell, category, location, condition and price (fixed or cost + %). Bulk updates are single queries now. |
| Quick Edit | `src/components/inventory/QuickEditSheet.tsx` | Now edits title, category, condition and cost, adds photos from the camera, shows what's missing, and shows the retail price next to the asking price. |
| Add Item | `src/pages/AddItem.tsx` | Barcode field with scan + "Look up" fills the empty fields. |
| Dedup | `src/utils/import-dedup-engine.ts` | UPC is now the first match key. Fills empty `upc`/`brand`/`retail_price`. |
| DB | `supabase/migrations/20261015000000_product_catalog_and_scan_intake.sql`, `src/integrations/supabase/types.ts` | `product_catalog` table; `items.brand`, `items.retail_price`. |
| Fixes | `SalesCheck.tsx`, `OrderSheet.tsx`, `LatticeImportDialog.tsx` | Cleared the 4 existing TypeScript errors. |

## Deploy (in order)

1. **Run the migration.** In the Supabase SQL editor, paste `supabase/migrations/20261015000000_product_catalog_and_scan_intake.sql`, or run `supabase db push`. The app expects `items.brand` / `items.retail_price`, so do this **before** shipping the frontend.
2. **Deploy the function:** `supabase functions deploy lookup-upc`
3. **Optional secrets:**
   - `supabase secrets set UPCITEMDB_API_KEY=...` for the paid tier (the free trial is about 100 new barcodes/day; cached barcodes are free).
   - `OPENWEBNINJA_API_KEY` (already used by fetch-amazon-prices) also enables ASIN autofill.
4. Build/deploy the frontend as usual (`npm run build`, or `npm run cap:sync` for the app).

## Quick test

- Inventory → **Scan** → type `012345678905` + Enter → a new item appears, autofilled if the lookup finds it. Type it again → the row shows ×2.
- Import → **Any list** → paste:
  ```
  Item Name,UPC,Qty,Price,Condition,Bin
  Bluetooth speaker,012345678905,2,$8.00,New in box,Shelf A
  Throw pillow,,1,3.50,used,Closet bin 3
  ```
- Inventory shows the **Needs details** banner → Start → Save & next.

---

## Next tasks for Claude Code

Paste one at a time. Each is scoped to specific files.

1. **Mirror lookup photos into storage.** Lookup images are hot-linked retailer URLs that can break. In `supabase/functions/lookup-upc/index.ts`, after a hit, download `images[0..2]` and upload them to a public `catalog-images` bucket keyed by code, then store those URLs in `product_catalog.images`. Keep the original URL as a fallback.
2. **Printable item labels.** Add a "Print labels" bulk action in `src/pages/Inventory.tsx` that renders a printable sheet of QR codes encoding `FF-<tracking_number>`. Teach `classifyCode` in `src/lib/barcode.ts` a third code type `internal` for `FF-\d+`, and make `findByCode` in `src/lib/scanIntake.ts` match it on `tracking_number`. Scanning a label then finds the exact unit.
3. **Per-platform listings and fees.** `item_listings` and `platforms` exist but nothing uses them. Add a "Listed on" section to `ItemDetail.tsx` and `QuickEditSheet.tsx` (platform, URL, price). Compute net profit per platform from `platforms.fee_percentage` + `flat_fee` in `calculateProfit` (`src/hooks/useInventory.ts`). Set `platform_fees` automatically when an item is marked sold.
4. **More export formats.** Next to `src/components/fb/MarketplaceExport.tsx`, add eBay (File Exchange CSV) and Mercari/Poshmark copy-paste exports built from the same item fields (title, brand, condition, description, price, photos).
5. **Reprice and stale alerts.** Use `workflowSettings.staleDaysThreshold` / `repriceDaysThreshold` to add "Stale" and "Reprice" quick filters in `Inventory.tsx` (listed longer than N days). Add a bulk "drop price by X%" option to `BulkEditDialog.tsx`.
6. **Offline scan queue.** In `ScanSession.tsx`, when a write fails because the device is offline, push it to a persisted queue (localStorage) and retry on the `online` event, so scanning in a garage with weak signal doesn't lose items.
7. **Tests.** Add vitest and port the checks for `src/lib/barcode.ts`, `src/utils/generic-list-parser.ts` and `src/utils/import-dedup-engine.ts`: UPC-E expansion, ISBN-10 with X, header-row detection under title rows, column auto-mapping, quantity/money/date/condition parsing, UPC dedup ignoring leading zeros.
8. **Housekeeping.** `git rm --cached .env` (it's tracked even though `.gitignore` lists it). Replace the Lovable template `README.md` with real setup and deploy steps (link this doc).
