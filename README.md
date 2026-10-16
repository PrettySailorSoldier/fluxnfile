# Flux&File

Resale inventory tracker for a small team. Scan or import what you buy, sort it into keep or sell, track where it lives, and follow each item through listing, offers, meetups and sale.

Runs as a mobile-first web app and as an Android/iOS app via Capacitor, backed by Supabase.

## What it does

- **Scan intake** (`/scan`): keeps the camera open for item-after-item scanning. Unknown barcodes are looked up and autofilled (title, photo, brand, category, suggested price). Scanning the same product again adds another unit. Also works with typed codes and Bluetooth/USB scanner guns.
- **Imports**: Amazon order history, Amazon Vine reports (XLSX), Lattice CSV, and any CSV/TSV/Excel list with automatic column mapping. Imports deduplicate on UPC, ASIN and order number.
- **Order Sheet**: items you've ordered but haven't physically received, checked off as you scan them in.
- **Inventory**: filters, sorts (profit, margin, age, location), bulk edit, and a "Needs details" queue for items missing a title, price, photo or category.
- **Selling**: Facebook Marketplace export, offer tracker, meetup scheduling with safety check-ins, and message templates.
- **Team tools**: shared tasks, rough notes for boxes not yet sorted, analytics, and Amazon review reminders.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router |
| Backend | Supabase (Postgres with row-level security, Auth, Storage, Edge Functions on Deno) |
| Mobile | Capacitor 8 (camera, haptics, status bar, splash screen) |
| Barcodes | `@zxing/library` |
| Hosting | Vercel (web) |

## Getting started

Requires Node.js 22 or newer and npm.

```sh
git clone https://github.com/PrettySailorSoldier/fluxnfile.git
cd fluxnfile
npm install
```

Create a `.env` file in the project root:

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
```

Both values are in the Supabase dashboard under **Project Settings → API**. They're safe to ship to the browser. Never put the service-role key here.

```sh
npm run dev      # http://localhost:8080
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on port 8080 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run cap:sync` | Build and sync `dist/` into the native projects |
| `npm run cap:android` | Build, sync, and open the project in Android Studio |
| `npm run cap:copy` | Build and copy web assets only (no plugin sync) |

## Project layout

```
src/
  pages/                 one file per route (Inventory, ScanSession, OrderSheet, ...)
  components/
    inventory/           scanner, quick edit, bulk edit, list import
    amazon/              Amazon, Vine and Lattice import dialogs
    fb/                  Facebook Marketplace tools, offers, meetups, safety check-ins
    ui/                  shadcn/ui primitives
  hooks/                 data hooks (useInventory, useOffers, useBarcodeScanner, ...)
  lib/                   barcode parsing, product lookup, scan-intake logic
  utils/                 import parsers and the dedup engine
  integrations/supabase/ Supabase client and generated database types
supabase/
  migrations/            database schema, applied in filename order
  functions/             Edge Functions (see below)
docs/                    feature write-ups
```

## Database

The schema lives in `supabase/migrations/`. The Supabase GitHub integration applies new migrations to the linked project when changes land on `main`, and the result shows up as the **Supabase Preview** check on the commit.

To apply them yourself with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase link --project-ref <project-ref>
supabase db push
```

Write new migrations so they're safe to run twice: use `IF NOT EXISTS`, and `DROP ... IF EXISTS` before creating policies, triggers and constraints. Changes made by hand in the SQL Editor aren't recorded as applied, so the integration will run the matching migration file again.

After a schema change, regenerate the TypeScript types:

```sh
supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts
```

## Edge Functions

| Function | Purpose | Secrets |
|---|---|---|
| `lookup-upc` | Barcode → product details (UPCitemdb, Open Food Facts, Open Library, OpenWeb Ninja), cached in `product_catalog` | `UPCITEMDB_API_KEY` (optional, paid tier), `OPENWEBNINJA_API_KEY` (optional, enables ASIN lookups) |
| `fetch-amazon-prices` | Current Amazon prices by ASIN | `OPENWEBNINJA_API_KEY` |
| `review-reminder` | Notifies team members about Amazon items still awaiting review after 3 days | none |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to every function automatically.

```sh
supabase functions deploy lookup-upc
supabase secrets set UPCITEMDB_API_KEY=...
```

## Deploying

- **Web:** Vercel builds `main` automatically with `npm run build`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project's environment variables.
- **Android:** `npm run cap:android`, then build or run from Android Studio. The `android/` and `ios/` folders are generated and not committed. Run `npx cap add android` (or `ios`) once on a new machine.

When a release includes a migration, make sure it has applied before the frontend that depends on it goes live.

## Further reading

- [docs/SCAN-INTAKE-UPGRADE.md](docs/SCAN-INTAKE-UPGRADE.md): scan session, product lookup and list import, with a quick test script and planned next tasks.
