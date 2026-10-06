# Wanderdex: Project Specification

**Version:** 1.3 (2026-10-06)
**Status:** Core build (Phases 1–3) done and live at `wanderdex.vercel.app`. Phase 4 (Trip Photos import, Profile, passport secret; §20) is specified, not built. Everything in §21 "Later" is out of scope.
**Owner:** Aarav Patel. Personal student / portfolio project.

---

## 0. How to use this document (read first, Claude Code)

- This file is the **source of truth** for the project. Decisions marked as decided are final unless the owner changes them.
- If something isn't specified here, choose the **simplest option that fits this spec**, then record the choice in `docs/DECISIONS.md` (date, decision, reason).
- **Do not add features from §21 (Later)** or any other unrequested features. The owner wants a lean, working core build first.
- **Ask before** changing anything listed as decided, adding a dependency not listed in §4, or adding a paid service.
- Keep commands in docs PowerShell-compatible (the owner runs commands in PowerShell). Package manager is **pnpm**.
- The design reference image lives at `docs/design/design-sheet.png`. It defines the look. Where it conflicts with this spec, **this spec wins** (conflicts are listed in §16.9).

---

## 1. Overview

Wanderdex is a web app that works as a personal travel passport. Users log places they've visited by pasting a Google or Apple Maps link, typing a plain-language description, or uploading a photo, or import a whole trip's photos at once. The app identifies the place, sorts it by category, city, and country, and shows every place on a zoomable, pixelated 8-bit world map called the **Overworld**. Users can rate each visit 1–10 and add notes, and a profile page shows their travel stats. The whole UI is styled like a retro 8-bit video game, and it must work well on both phones and desktops.

### 1.1 Goals
1. Adding a place takes seconds and usually needs only one tap to confirm.
2. The app feels fun and game-like, with one consistent design language.
3. Works well on mobile (from 375px wide) and desktop.
4. Runs on free tiers for a personal-scale project.

### 1.2 Non-goals (for the core build)
Social features, sharing, public profiles, photo storage, stamps, dark mode, native apps, email of any kind, password recovery.

### 1.3 Scope note on Google data
Storing Google Places data (names, coordinates, addresses, types) in our own database, including the shared lookup cache (§17), is a gray area under Google Maps Platform terms. The owner has **accepted this for a personal student project**. If Wanderdex ever becomes a public product, this must be revisited (options: open data like OpenStreetMap, or re-fetching from Google instead of storing).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Overworld** | The map screen (`/`). Name taken from the game term for a world map. |
| **Place** | A real-world location (a cafe, a museum). Shared across users when it comes from Google. |
| **Visit** | One user's record of going to a place, with date, rating, and note. A place can have many visits. |
| **Add panel** | The UI for adding a visit, with four modes: Paste Link, Upload Photo, Type Location, Trip Photos. |
| **Stop** | In a Trip Photos import, a group of photos taken at one spot around one time. Each stop can become one visit (§11.8). |
| **Review screen** | The Trip Photos screen listing an import's stops, where the user checks matches and saves them all at once (§11.8). |
| **Candidates** | The 1–3 place matches shown for the user to pick from. |
| **Confirmation card** | The card showing candidates plus the date, category, rating, and note fields. Saving happens here. |
| **RPG dialog** | The app's dialog style: dark box, orange pixel border, RPG-style text and choices (see sheet). |
| **Precision** | How exact a visit's date is: `datetime`, `date`, or `month`. |

---

## 3. Decisions summary

| Area | Decision |
|---|---|
| Name | **Wanderdex** (`wanderdex.com` is a parked, for-sale domain; we use the Vercel subdomain) |
| Map screen name | **Overworld** |
| Map detail | Country shapes **plus** street tiles (OpenFreeMap), pixelated |
| Map start view | Fit all the user's pins; world view if they have none |
| Same place, many visits | One pin per place; place detail lists every visit |
| Add modes | Four separate modes: Paste Link, Upload Photo, Type Location, Trip Photos (many photos at once, §11.8) |
| Partial dates | Allowed (`datetime`, `date`, `month`), stored with a precision flag |
| Displayed time zone | The place's local time zone |
| Save flow | Save from the confirmation card, then a "New place discovered!" toast ("Return visit!" for a place the user already has visits at). No extra confirm dialog on save. |
| Dialog style | **Every** dialog in the app uses the RPG style, except the passport secret (§15.1) |
| Text parsing AI | Gemini Flash-Lite (free tier). Fallback: Claude Haiku if free limits become a problem. |
| Categories | Fixed list of 14 (§12.5), no custom categories |
| Username | 3–20 chars, `a–z 0–9 _`, not case-sensitive (stored lowercase) |
| Password | Minimum 6 characters, no other rules, confirm field at signup, **no recovery**; changeable on the profile (§14.6) |
| Sessions | Stay logged in until logout |
| Profile | `/profile`: stats, change password, export, delete account, log out (§14.6). Still no Settings page. |
| Country count | Out of 195 (193 UN members + Vatican City + Palestine); territories count toward their sovereign (§14.6) |
| Account deletion | Self-serve on the profile, confirmed by typing the username; can't be undone (§14.6) |
| Edit/delete | All visit fields editable; delete asks for confirmation in an RPG dialog |
| Visits list sort | Most recent visit date first |
| Photos | Read in the browser only. **Never uploaded or stored.** Trip Photos too (§11.8). |
| Body font | VT323 |
| Dark mode | Not in core build (Later list) |
| Build method | Claude Code builds; a separate Claude chat handles design decisions and reviews |
| Package manager | pnpm |
| Repo | Public GitHub repo `wanderdex`, no secrets committed |
| Hosting | Vercel free tier, `wanderdex.vercel.app` |
| Supabase keep-alive | GitHub Actions scheduled ping every ~3 days |
| Google key | Budget alert on day one; daily request caps once billing is upgraded from the Free Trial (see §17) |

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Frontend and server route handlers in one codebase |
| Styling | **Tailwind CSS** | Design tokens as CSS variables (shadcn convention) |
| Base components | **shadcn/ui** | Foundation for 8bitcn |
| 8-bit components | **8bitcn** | Installed directly from its registry with the shadcn CLI, e.g. `pnpm dlx shadcn@latest add @8bitcn/button`. The 21st.dev copy limit doesn't apply this way. |
| UI icons | **Pixelarticons** | Fork/knife, star, calendar, bell, warning, etc. |
| Fonts | **Press Start 2P** (headings, buttons), **VT323** (body) | Loaded with `next/font/local` from font files committed to the repo (from Google Fonts, with their SIL OFL licenses) |
| Toasts | Sonner via shadcn/8bitcn toast | Restyled to tokens |
| Mobile drawer | shadcn **Drawer** (Vaul) | The slide-up panel on mobile |
| Map | **MapLibre GL JS** (5.x) | Hybrid (§13.1): low `pixelRatio` + CSS pixelated scaling at world zoom, full resolution when zoomed in |
| Map tiles | **OpenFreeMap** | Free, no account or key. Attribution required. |
| Country shapes | **Natural Earth** admin-0 countries GeoJSON (1:110m or 1:50m) | Public domain. Visited-country fill. |
| Pin clustering | **supercluster** | Clusters computed in JS, rendered as HTML markers (see §13.4 for why) |
| Database + auth | **Supabase** (Postgres + Auth + RLS), `@supabase/ssr` for Next.js | |
| Place lookup | **Google Places API (New)** | Text Search, Nearby Search |
| Text parsing | **Gemini API**, Flash-Lite model, structured JSON output | Server-side only |
| Photo metadata | **exifr** | Runs in the browser; supports HEIC and the TIFF-based RAW formats (§11.2). Reads only the metadata part of a file (its chunked reader), never the whole file. For Trip Photos it runs in a Web Worker (no library) and also reads the embedded thumbnails for the review (§11.8). |
| Coordinates → time zone | A tz lookup library (e.g. `@photostructure/tz-lookup`) | Offline, no API. On the server, plus a lazy browser chunk for a dropped pin and Trip Photos. |
| Date handling | `date-fns` + `date-fns-tz` (or equivalent) | |
| Validation | **zod** | For API inputs and the LLM's JSON output |
| Unit tests | **Vitest** | Parsers and mapping logic (§19) |
| Hosting | **Vercel** (Hobby) | |
| Scheduled ping | **GitHub Actions** cron | |
| Optional browsing | 21st.dev | For ideas only (free tier: 2 component copies/day). Not needed, since 8bitcn installs directly. |

Other free resources the owner may use: **Lospec** (palettes), **itch.io** free pixel assets (check licenses), **NES.css** (style reference only, not code).

---

## 5. Architecture

```
Browser (Next.js client)
 ├─ Overworld map: MapLibre (pixelated canvas) + HTML pin markers
 ├─ Add panel: Paste Link | Upload Photo (exifr, local only) | Type Location | Trip Photos (exifr, local only, many at once)
 └─ No direct Supabase access: pages read on the server, changes go through the routes below
        │
        ▼
Next.js server (Vercel)
 ├─ Pages + Server Functions → read the user's data with their session (RLS); login, signup, logout;
 │                             profile stats, export data, change password, delete account (admin API)
 ├─ /api/resolve/link    → expand link, parse, Google Text Search
 ├─ /api/resolve/text    → Gemini parse, Google Text Search
 ├─ /api/resolve/nearby  → Google Nearby Search (photo GPS / manual pin)
 ├─ /api/resolve/import  → a trip's stops: the user's own places first, else Google Nearby Search (§11.8)
 ├─ /api/visits (save)   → upsert place (secret key), reuse one by id, or create a manual place, + insert visit
 ├─ /api/visits/[id]    → edit / delete one visit (session client, RLS)
 ├─ /api/places/[id]/category → the user's category for a place (their visits only)
 └─ /api/health          → trivial DB query (keep-alive target)
        │
        ├─► Supabase Postgres (profiles, places, visits, resolve_log, google_call_log, nearby_cache, import_log)
        ├─► Google Places API (New)   [secret key, server only]
        └─► Gemini API                [secret key, server only]

Map tiles: browser → OpenFreeMap directly (no key)
Country shapes: served as a static file from /public/geo/
```

Rule: **all secret keys stay on the server.** The browser never talks to Supabase directly: the session lives in cookies, and the server uses it with the Supabase URL and publishable key.

---

## 6. Repository structure (suggested)

```
wanderdex/
├─ docs/
│  ├─ SPEC.md
│  ├─ DECISIONS.md
│  ├─ ARCHITECTURE.md     # Trip Photos pipeline + cost layers (§11.8, §17)
│  └─ design/design-sheet.png
├─ public/
│  ├─ sprites/            # the PNG assets (§16.7)
│  └─ geo/countries.geojson
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (auth)/signup/page.tsx
│  │  ├─ (app)/page.tsx               # Overworld
│  │  ├─ (app)/visits/page.tsx        # My Visits
│  │  ├─ (app)/places/[id]/page.tsx   # Place detail + its visits
│  │  ├─ (app)/profile/page.tsx       # Profile: stats + account (§14.6)
│  │  └─ api/...                      # route handlers (§5)
│  ├─ components/
│  │  ├─ ui/              # shadcn + 8bitcn components
│  │  ├─ map/             # Overworld, markers, cluster badge
│  │  ├─ add/             # add panel, modes, confirmation card
│  │  ├─ import/          # Trip Photos review screen (§11.8)
│  │  ├─ profile/         # profile sections, bar chart, account actions
│  │  ├─ passport/        # passport secret (§15.1)
│  │  └─ dialogs/         # RPG dialog wrapper
│  ├─ lib/
│  │  ├─ supabase/        # server (session) + admin (secret key) clients
│  │  ├─ google/          # Places API calls, field masks
│  │  ├─ ai/              # Gemini parse + schema
│  │  ├─ links/           # link parsing (unit tested)
│  │  ├─ categories.ts    # Google type → category map (unit tested)
│  │  ├─ dates.ts         # precision + time zone logic (unit tested)
│  │  ├─ photo.ts         # exifr reading
│  │  ├─ trip/            # Trip Photos: reading worker, grouping, grid index, its config (unit tested)
│  │  └─ stats/           # profile stats, country + continent tables (unit tested)
│  └─ styles/globals.css  # tokens
├─ supabase/migrations/   # SQL (§8, §9)
├─ scripts/bench-import.ts, synthetic-trip.ts # synthetic Trip Photos benchmark (§11.8, `pnpm bench:import`)
├─ .github/workflows/keepalive.yml
├─ .env.example
└─ README.md
```

---

## 7. Environment variables

| Name | Where used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | No |
| `SUPABASE_SECRET_KEY` | Server only (writing shared `places`) | **Yes** |
| `GOOGLE_PLACES_API_KEY` | Server only | **Yes** |
| `GEMINI_API_KEY` | Server only | **Yes** |
| `ANTHROPIC_API_KEY` | Server only; only if the Claude Haiku fallback is ever enabled | **Yes** |
| `HEALTH_PING_TOKEN` | `/api/health` + GitHub Actions secret | **Yes** |
| `RESOLVE_SIGNING_SECRET` | Server only; signs lookup candidates in `/api/resolve/*` and checks them in `/api/visits` | **Yes** |

If the Supabase project still shows the older "anon" and "service_role" key names, use those in the same roles. `.env.local` is git-ignored; `.env.example` lists every name with empty values; production values live in Vercel's environment settings.

---

## 8. Data model (Postgres / Supabase)

```sql
-- Categories (fixed list)
create type place_category as enum (
  'food','cafe','bar','museum','landmark',
  'park_nature','shopping','stay','entertainment',
  'sports','campus','airport','city','other'
); -- sports, campus, airport, city added 2026-10-06 (ALTER TYPE … ADD VALUE … BEFORE 'other')

create type date_precision as enum ('datetime','date','month');

create type visit_source as enum ('link','text','photo','manual');

-- One row per user
create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique
             check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- One row per real-world place
create table places (
  id                  uuid primary key default gen_random_uuid(),
  google_place_id     text unique,              -- null for manual places
  name                text not null,
  category            place_category not null default 'other', -- auto-detected default
  google_primary_type text,
  address             text,
  city                text,
  country             text,
  country_code        char(2),                  -- ISO 3166-1 alpha-2, uppercase
  lat                 double precision not null,
  lng                 double precision not null,
  timezone            text,                     -- IANA, from coordinates
  created_by          uuid references auth.users(id) on delete set null, -- set for manual places
  created_at          timestamptz not null default now()
);

-- One row per visit
create table visits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  place_id          uuid not null references places(id) on delete restrict,
  category          place_category not null,   -- the user's category (see note)
  visited_at        timestamptz not null,      -- UTC instant
  visited_precision date_precision not null default 'datetime',
  timezone          text not null,             -- IANA zone used to display visited_at
  rating            smallint check (rating between 1 and 10),
  note              text check (char_length(note) <= 2000),
  source            visit_source not null,
  source_input      text,                      -- original link or typed text (never photo data)
  import_id         uuid,                      -- Trip Photos import (§11.8), else null   (Phase 4)
  import_stop       smallint,                  -- the stop's number in that import        (Phase 4)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index visits_user_visited_idx on visits (user_id, visited_at desc);
create index visits_user_place_idx   on visits (user_id, place_id);
-- Idempotent import saves (§11.8 step 8): one visit per import stop             (Phase 4)
create unique index visits_import_stop_idx on visits (user_id, import_id, import_stop)
  where import_id is not null;

-- For per-user rate limiting of lookups
create table resolve_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                  -- 'link' | 'text' | 'nearby' | 'import' (§17; plain text, so 'import' needs no migration)
  created_at timestamptz not null default now()
);
create index resolve_log_user_time_idx on resolve_log (user_id, created_at desc);

-- For the global monthly cap per Google SKU (§17): one row per Google Places call
create table google_call_log (
  id         bigint generated always as identity primary key,
  sku        text not null check (sku in ('text_search', 'nearby_search')),
  user_id    uuid references auth.users(id) on delete set null, -- who caused it; kept counted if deleted
  created_at timestamptz not null default now()
);
create index google_call_log_sku_time_idx on google_call_log (sku, created_at);

-- Phase 4 (one migration in step 4.2, with the visits columns above)

-- Shared Nearby Search cache (§17): one row per rounded location cell, shared by all users
create table nearby_cache (
  cell       text primary key,                -- rounded 'lat,lng' of the looked-up point
  candidates jsonb not null,                  -- up to 3 results (§12.1 fields); [] = none within 150 m (kept 7 days, §17)
  fetched_at timestamptz not null default now()
);                                            -- no user id: it records places, not who looked
create index nearby_cache_fetched_idx on nearby_cache (fetched_at);

-- One row per Trip Photos import's lookups (§11.8 step 5): counts only, no locations
create table import_log (
  id               bigint generated always as identity primary key,
  import_id        uuid not null unique,      -- also on the import's visits
  user_id          uuid references auth.users(id) on delete set null,
  stops            int not null,
  local_matches    int not null,              -- stops answered by the user's own places
  shared           int not null,              -- stops answered by another stop's lookup
  cache_hits       int not null,              -- lookups answered by nearby_cache
  google_lookups   int not null,              -- lookups sent to Google
  google_calls     int not null,              -- Google calls made (a 150 m retry counts twice)
  unmatched_limit  int not null,              -- stops left unmatched by the allowance or a cap
  created_at       timestamptz not null default now()
);
```

**Why `category` is on `visits`:** `places` is shared across users, so one user's category edit must not change it for everyone. `places.category` is the auto-detected default; each visit copies it at creation. **One category per user per place:** when a user edits the category on a place detail page, update **all of that user's visits for that place**, so their pin stays consistent. The pin uses that category. The same applies when a save adds a visit at a place where the user already has visits (by id, or a signed lookup of a place they've logged) in a different category: all of their visits there take the new one (§11.6 step 4).

**Dates:**
- `visited_at` is stored in UTC, computed from the local time plus `timezone`.
- `month` precision stores the 1st of the month at 12:00 local time; `date` precision stores 12:00 local time. The UI hides the unknown parts ("Mar 2025", "Mar 12, 2025").
- `timezone` comes from the place's coordinates (tz lookup library).

**Other notes:**
- Rows are tiny (~1 KB per visit), so the free 500 MB database holds hundreds of thousands of visits.
- `updated_at` is maintained by a trigger.
- Deleting a visit never deletes its place row, a manual place (§11.4) included.
- **Account deletion (§14.6):** nothing may block deleting a user from `auth.users`. `profiles`, `visits`, and `resolve_log` cascade. `places.created_by`, `google_call_log.user_id`, and `import_log.user_id` become null (`on delete set null`): a deleted user's Google calls stay counted toward the monthly cap (§17), and their import counts stay for analysis. The server deletes the user's private manual places itself (§14.6), since `set null` would leave them orphaned.

---

## 9. Row Level Security

Enable RLS on every table.

| Table | Rule |
|---|---|
| `profiles` | A user can read only their own row. All writes happen on the server. |
| `places` | Logged-in users can read rows where `google_place_id is not null`, **or** where `created_by = auth.uid()` (manual places are private to their creator). **No insert/update from the browser**; the server inserts with the secret key. |
| `visits` | A user can select, insert, update, and delete only rows where `user_id = auth.uid()`. |
| `resolve_log` | No browser access. Server only. |
| `google_call_log` | No browser access. Server only. Its `user_id` becomes null when the user is deleted, so it never blocks account deletion (§8). |
| `nearby_cache` | No browser access: RLS on, no policies, privileges for `service_role` only. |
| `import_log` | No browser access: RLS on, no policies, privileges for `service_role` only. |

---

## 10. Accounts and auth

- **Supabase Auth is email-based**, so each username maps to a hidden placeholder email: `<username>@wanderdex.local`. If Supabase rejects that format, use another non-routable placeholder domain and record it in `DECISIONS.md`. Users never see this email.
- **Signup fields:** Username, Password, Confirm password.
  - Username: 3–20 characters, letters, numbers, underscores. Lowercased before saving. Show "Username taken" if it exists.
  - Password: minimum 6 characters. **No other rules** (no number, symbol, or case requirements). Supabase's default minimum is already 6.
  - A visible warning: "Passwords can't be recovered. Pick one you'll remember."
  - On success, create the `profiles` row and log the user in.
- **Login fields:** Username, Password. **No "Forgot password?" link.** No email field anywhere.
- **Supabase settings:** email confirmations **off**; built-in auth rate limits **on** (they matter because passwords can be simple).
- **Sessions:** persistent; the user stays logged in until they log out.
- **Log out:** confirmed with an RPG dialog ("Leave the Overworld?" Yes / No). It's in the desktop sidebar and in the profile's Account section (the only place on phones).
- **Change password and delete account:** on the profile (§14.6).
- **Route protection:** logged-out users are redirected to `/login`; logged-in users visiting `/login` or `/signup` go to `/`.

---

## 11. Adding a visit

The add panel has **four separate modes**: **Paste Link**, **Upload Photo**, **Type Location** (as in the design sheet), and **Trip Photos** (§11.8), which adds many visits at once through its own review screen instead of the confirmation card. There is no auto-detection between modes. A manual fallback is always reachable.

### 11.1 Paste Link (server: `/api/resolve/link`)
1. Validate that the input is a supported URL:
   - Google: `maps.app.goo.gl/…`, `goo.gl/maps/…`, `google.<tld>/maps/…`, `maps.google.<tld>/…`
   - Apple: `maps.apple.com/…`, and the newer short links `maps.apple/…` (e.g. `maps.apple/p/…`)
   - Anything else → "That doesn't look like a Maps link."
2. **Expand short links** by following redirects on the server (cap at ~5 redirects, ~5 s timeout). Every hop must stay on one of the hosts above.
3. **Parse** the final URL. Handle these known forms, with unit tests using real sample URLs:
   - Google `/maps/place/<name>/@<lat>,<lng>,<zoom>z/…` → name + coordinates
   - Google `/maps/search/<query>/@<lat>,<lng>…` → query + coordinates
   - Google `?q=<text or lat,lng>` / `?query=…` → query or coordinates
   - Google `!3d<lat>!4d<lng>` inside the `data=` part → more precise coordinates than `@`
   - Apple `q=` (name), `ll=` (lat,lng), `address=`, and newer forms with `name=` and `coordinate=`
   - Apple `maps.apple.com/place?place-id=…` (where `maps.apple/p/…` links land), which has no name or coordinates in the URL: fetch that page (no redirects, ~5 s timeout, first ~512 KB only) and read only its `og:title` (minus any "Apple Maps" suffix) and `place:location:latitude` / `place:location:longitude` meta tags. Coordinates must be valid numbers in range. If any tag is missing or invalid, it's a parse failure (step 6).
   - Decode `+` and percent-encoding in names.
4. **Look up:** Google Text Search with the name (or query), plus a ~500 m location bias circle if coordinates exist. If only coordinates exist, use Nearby Search (§11.2 step 4).
5. Return up to 3 candidates. Keep the original link as `source_input`.
6. Google doesn't document its URL format, so parsing can break. **On any parse failure:** an RPG dialog says "Couldn't read that link. Try typing the place instead." with a button that switches to Type Location, carrying over any parsed name.

### 11.2 Upload Photo (browser, then `/api/resolve/nearby`)
1. The user picks one image with the device's normal image picker ("Choose photo"), or, on desktop, drops it on the panel. JPEG, PNG, HEIC, WebP, and the TIFF-based RAW formats exifr reads are read: DNG (iPhone ProRAW), Canon CR2, Nikon NEF, Sony ARW, Pentax PEF, Olympus ORF, and Panasonic RW2 (each checked on a real file; CR3 and RAF aren't TIFF-based and exifr can't read them). A file counts by its type (compared in lower case: Windows reports DNG as `image/DNG`), or by its extension when the type is empty, generic, or a vendor `image/x-…` one. Any other file shows "That file isn't a photo we can read." (so does a file the reader can't parse).
2. **Read metadata in the browser with exifr** (`src/lib/photo.ts`; exifr loads only when a photo is picked): GPS latitude/longitude, `DateTimeOriginal`, `OffsetTimeOriginal`. Only the metadata part of the file is read, never the whole file (a ProRAW DNG is 25–75 MB): exifr's chunked reader (a first 64 KB, then only where the metadata points; for TIFF-based files it also loads the part under the GPS block, which exifr alone would miss), and PNG and WebP are walked chunk header by chunk header to their EXIF chunk. **The image is never uploaded, stored, or sent anywhere.** Only the coordinates go to `/api/resolve/nearby` (it accepts `{ lat, lng }` and nothing else); the date goes to the server only as the saved visit's date. GPS of exactly 0,0 counts as none.
3. **No GPS** → warning alert "This photo has no location data." with "Type where it was taken instead.", and the panel switches to Type Location, showing the photo's date if it had one. That date pre-fills the confirmation card (exact time) unless the typed text gives a date. The visit is a Type Location visit (source `text`).
4. **Has GPS** → `POST /api/resolve/nearby` (session check, zod, signed candidates like the other lookups): Google Nearby Search, radius 50 m, ranked by distance, max 3 results. If none, retry once at 150 m. The shared lookup cache (§17) is checked first. If still none, go straight to the drop-a-pin flow (§11.4) with the pin pre-placed at the photo's coordinates.
5. **Date:** use `DateTimeOriginal` (precision `datetime`). If `OffsetTimeOriginal` exists, use it (the instant, shown in the place's time zone); otherwise interpret the time in the place's time zone. **No date** → default to now. The card works in its first candidate's zone, as for the other modes.
6. Visits saved from this mode have source `photo` and no `source_input`.
7. Expect GPS to be missing often: phone browser photo pickers and messaging apps frequently strip location data. This is expected behavior, not a bug.

### 11.3 Type Location (server: `/api/resolve/text`)
1. Send the text to Gemini with today's date and the user's current time zone (for relative dates like "last March").
2. Gemini returns JSON (validated with zod), per §12.3.
3. Google Text Search with `query` (+ `location_hint` appended if present). Up to 3 candidates.
4. **If Gemini fails, times out, or hits a rate limit** → search with the raw text and default the date to now. The AI step must never block the flow.
5. **The AI only interprets text. It never supplies facts** (addresses, coordinates, whether a place exists). Facts come from Google.

### 11.4 Manual fallback (drop a pin)
1. **Reachable** from every mode's panel ("Can't find it? Drop a pin"), from the "No places found" message (a "Drop a pin" button), and from the confirmation card after a lookup. From a photo, the pin starts at the photo's coordinates (if it had any) and the card gets the photo's date.
2. **Placing:** the add panel gets out of the way (desktop: the bubble or card closes; phones: the drawer closes), and a "Drop a pin" card over the bottom of the map says what to do ("Click/Tap the map to drop a pin.", then "Pin dropped. Click/Tap again to move it.") with a "Drop pin at center" button, Confirm (once a pin is placed), and Cancel. A click or tap on the map places a pixel pin there; another moves it. A small pixel crosshair marks the map's center (the center of the part the desktop sidebar leaves uncovered), and "Drop pin at center" places the pin there, or moves it, so a pin can be placed without a pointer, and precisely on a phone. The map takes keyboard focus when placing starts, so the arrow keys pan it under the crosshair. Place pins don't open while placing. Escape, Cancel, or Add Visit gives up. Starting from a photo, the map flies to its coordinates (street zoom).
3. **Confirm** opens the confirmation card for the new place (titled "New place"; desktop side panel, phone drawer): **Name** (required, at most 100 characters) instead of the candidates, **Category** (the 14, starting at Other), and the usual date & time with precision, rating, and note (§11.5). The date starts at the photo's date, or now, in the pin's time zone.
4. **Saving** (`/api/visits`, a `manual_place` with the name and coordinates, zod-validated): the server works out city and country from the coordinates: a Nearby Search at the point (50 m, then 150 m; the shared lookup cache, §17, first), using the first result's address components with the §12.1 rules (Tokyo included). If there are none (or Google fails, or Nearby Search is at its monthly cap (§17), which skips the call), the country comes from `public/geo/countries.geojson` by point-in-polygon (English name from its code) and the city stays empty. The time zone comes from the coordinates; the address stays null. It creates a `places` row with `google_place_id = null`, the chosen category, and `created_by = user` (private, §9), then the visit (source `manual`, or `photo` from Trip Photos (§11.8); no `source_input`). After that it's like any save (§11.6 steps 5–7): toasts, the pin, the map flying to it.
5. A return visit to a manual place uses the place's id ("Add another visit", §14.4). A manual place whose last visit is deleted stays in the database, private and unused (§8).

### 11.5 Confirmation card
Shown after any successful lookup:
- **Candidates:** up to 3, each with category sprite, name, and city/country. The first is preselected; one tap switches.
- **Date & time:** pre-filled (from the photo, the parsed text, or now), with a precision control: exact time / date only / month only, a segmented toggle that starts at the parsed precision (exact time when it defaults to now). Date only hides the time; month only picks just a month and year. Changing the date or time keeps the chosen precision. Saved per §8.
- **Category:** auto-set from Google types (§12.5), editable (dropdown of the 14).
- **Rating:** optional 1–10 selector, 44px cells. Desktop: one row of 10. **Mobile: two rows of 5** (ten 44px tap targets don't fit across 375px). Tapping the chosen number again clears it.
- **Note:** optional, up to 2000 characters. It starts one line tall and grows as you type; a character count shows near the limit.
- **Phones:** Rating and Note start collapsed behind an "Add rating & note" button, which shows both in place, so the card fits (§14.2) and a plain save stays one tap. Desktop shows them from the start.
- **Buttons:** "Save visit" (primary), "Cancel" (secondary), and a "Can't find it? Drop a pin" link (§11.4), on the Matches row so it adds no height. Not on place detail's "Add another visit" card, or on a dropped pin's own card.

### 11.6 Saving (`/api/visits`)
1. Re-validate input on the server (zod), and check the place's signature: every candidate from `/api/resolve/*` is signed on the server (HMAC-SHA256 with `RESOLVE_SIGNING_SECRET`) over all the place fields the save uses, with a 24-hour expiry. A missing, wrong, or expired signature saves nothing and shows "The map spirits aren't answering. Try again." Only the user's choices (category, date/time, precision, rating, note) are unsigned. Rating is a whole number 1–10 or none; the note is trimmed, at most 2000 characters, and an empty note is none. Without the secret, lookups and saves fail.
   - **Existing place, by id:** a save may instead name a place that already exists by its `id` (place detail's "Add another visit", §14.4, including return visits to manual places). Nothing about the place is written, so there's no signature: the server only checks that the place exists and that the user can read it under RLS (§9), using the user's session. These visits are saved with source `manual` (`photo` from Trip Photos, §11.8) and no `source_input`.
   - **New manual place:** a dropped pin (§11.4) sends its name and coordinates, unsigned: the place is private to its creator (§9), so made-up values only affect that user.
2. Upsert the place by `google_place_id` with the secret key (insert if new, otherwise reuse). A save by id skips this; a dropped pin inserts its new manual place (§11.4).
3. Compute `timezone` from coordinates and `visited_at` in UTC.
4. Insert the visit with the chosen category. Just before, if the user already has visits at this place in another category, update them to the chosen one (one category per user per place, §8); if that update fails, nothing is saved.
5. Check whether this is the user's **first visit in this country** (no other visit of theirs with the same `country_code`, not counting the one just inserted). A place without a `country_code` never counts. The response says so with a flag. A second flag says whether it's a **return visit**: the user already had another visit at this place, from any path (including pasting a link for a place they've logged before).
6. The client shows:
   - A new place: toast "New place discovered!" / "<name> added to your Wanderdex."
   - A return visit, instead: toast "Return visit!" / "Another visit to <name> logged."
   - Also, if first in country: toast "First visit to a new country!" / "You visited <country> for the first time!"
7. The new pin appears on the Overworld and the map pans to it.

### 11.7 Error and empty states (copy)
| Situation | Message |
|---|---|
| Not a Maps link | "That doesn't look like a Maps link." |
| Link can't be parsed | "Couldn't read that link. Try typing the place instead." |
| No search results | "No places found. Drop a pin instead?" |
| Photo without GPS | "This photo has no location data." + "Type where it was taken instead." |
| Unsupported file | "That file isn't a photo we can read." |
| Rate limit hit | "Slow down, traveler! Try again in a bit." |
| Google or network error | "The map spirits aren't answering. Try again." |
| Map doesn't load (§13.1) | In place of "Loading...", an RPG-style box over the map: "The map spirits aren't answering. Try again." with a "Try again" choice |
| A page fails to load | The same RPG-style box and "Try again", as the page (app pages keep the sidebar and tab bar), on the cream page with its background art (§16.7) |
| No such page | "The trail goes cold here." in an RPG-style box, with "Overworld" and "My Visits" choices, on the cream page with its background art |
| No visits yet (Overworld) | RPG dialog-style hint: "Your adventure starts here. Add your first place!", as a speech bubble whose tail points at Add Visit (the sidebar item on desktop, the tab on mobile), with a "Later" button. Later hides it until the Overworld next loads; pressing Add Visit does too. |
| No visits match filters | "No visits match these filters." |
| Trip Photos: more than 500 photos | "That's more than 500 photos. Import your trip in smaller batches." |
| Trip Photos: more than 150 stops | "That's more than 150 stops. Import your trip in smaller batches." |
| Trip Photos: no usable photo | "None of these photos have a location and date." |
| Trip Photos: some photos skipped | "Skipped 15 photos: 12 without a location or date, 3 unreadable." (only the parts that apply) |
| Trip Photos: lookups ran out (§17) | "Out of place lookups for now. 4 stops have no match: pick one of your places or drop a pin." |
| Trip Photos: a stop failed to save | "Couldn't save this stop. Try again." (on the stop) |
| Leaving the review with unsaved stops | RPG dialog "Leave without saving?" + "Unsaved stops will be lost." Leave / Stay |
| Wrong current password (§14.6) | "That's not your current password." |

Messages that need acknowledgment use the RPG dialog. Non-blocking messages use toasts or alerts.

### 11.8 Trip Photos import (browser, then `/api/resolve/import`)
Adds a whole trip's visits at once from its photos. It's the fourth add mode, a bigger cousin of Upload Photo (§11.2), and it ends in a review screen instead of the confirmation card. (Numbered 11.8, not next to §11.2, so the older section numbers that `DECISIONS.md` cites stay valid.)

1. **Picking:** "Trip Photos" in the desktop add bubble and the phone drawer. A "Choose photos" button opens the device's photo picker with multi-select (`<input type="file" multiple accept="image/*">`); on desktop, many files can also be dropped on the panel. The same file types as §11.2 step 1; any other file counts as unreadable (step 3). At most **500 photos** per import (one config constant); picking more reads nothing and shows "That's more than 500 photos. Import your trip in smaller batches." The privacy line from Upload Photo shows under the button, in the plural: "The photos stay on your device. Only their locations and dates are used." On desktop the panel's dashed box says "Drop photos here, or" above the button.
2. **Reading (browser only, in a Web Worker):** so the page stays responsive with 500 photos, reading runs in a Web Worker (`src/lib/trip/read-worker.ts`, started with `new Worker(new URL(…, import.meta.url))`, so it and the code it loads download only when photos are picked). The page hands the worker the picked `File`s (they stay in the browser) in batches of 25 (`POST_BATCH`), one message per task, since the browser registers each File for the worker synchronously the first time it's posted (about 0.3 ms each); none of this runs inside the pick's own event. The worker reads at most **4** at a time (bounded concurrency, `READ_CONCURRENCY` in the config), reporting progress after each photo: exifr reads each photo's GPS, `DateTimeOriginal`, and `OffsetTimeOriginal` with the §11.2 rules (`src/lib/photo.ts`, metadata only), and the worker works out its instant, groups the photos into stops (step 4), and reads each stop's thumbnail (step 7). It sends back only the stops (coordinates, times, which photos), the skipped counts, and the thumbnails (transferred, not copied), plus progress for the line "Reading photos 42/300". While it reads, the panel's controls are disabled, as during a lookup; closing the panel stops the worker. If the worker or the photo reader can't load (offline), the panel shows "The map spirits aren't answering. Try again." **Photos are never uploaded, stored, or sent anywhere.** Only each stop's coordinates and local date go to the server (step 5), and its time only as a saved visit's date. Review thumbnails come from the local files only, as object URLs, never uploaded (step 7).
3. **Skipped photos:** a photo without GPS (0,0 counts as none), without a usable date (it can't be placed in time), or that can't be read is skipped and counted. The review opens with a summary line: "Skipped 15 photos: 12 without a location or date, 3 unreadable." If no photo is usable: "None of these photos have a location and date.", and nothing else happens.
4. **Grouping into stops** (`src/lib/trip/group.ts`, in the reading worker, unit tested; every threshold in `src/lib/trip/config.ts`, the 150-stop cap with the import limits in `src/lib/rate-limits.ts`):
   - A photo's instant (worked out in the worker): with `OffsetTimeOriginal`, that instant; otherwise its time read in the time zone at its coordinates (the tz lookup, loaded by the worker).
   - Sort by instant (photos taken at the same instant keep the order picked). A photo joins the current stop if it's within **150 m** of the stop's centroid **and** within **2 hours** of the previous photo (both inclusive); otherwise it starts a new stop.
   - Then merge stops at the same spot (centroids within **150 m**) on the same local day (each stop's first photo's date, in the zone at its centroid), recomputing the centroid, until nothing more merges (a merged centroid moves). Stops are numbered from 1 in time order. Centroids average longitudes across the antimeridian correctly.
   - A stop's **location** is its photos' centroid. Its **time** is its first photo's, at exact-time precision, in the place's time zone; its **local date** is that time's date there.
   - More than **150 stops** (§17): nothing is looked up, and the panel shows "That's more than 150 stops. Import your trip in smaller batches."
5. **Lookups** (`POST /api/resolve/import`: session check; zod, strict: the import's id (step 8) and at most 150 stops, each `{ lat, lng, date }` with `date` the stop's local `YYYY-MM-DD`, and nothing else). One request per import, behind a "Finding places..." line. Each stop is answered by the first of these layers that can, cheapest first (§17):
   - **Your places (local match):** the user's own places (under their session, RLS, with the paging helper) within 150 m of the stop, nearest first. The server puts the places in a **spatial grid index** (`src/lib/trip/`, cells at least 150 m on a side, so a stop checks only its own cell and the 8 around it, never every place). If one is within **50 m**, the nearest is preselected and the stop needs **no lookup**.
   - **Shared result:** the remaining stops within **50 m** of each other (found with the same grid) share one lookup and its results.
   - **Cache hit:** each remaining lookup checks the shared lookup cache (§17) at its point first.
   - **Google:** otherwise one Nearby Search at the point, as in §11.2 step 4 (50 m, one retry at 150 m, up to 3, by distance), and the result goes into the cache.
   - Candidates, cached or fresh, are signed as usual (§11.6 step 1) and carry their time zone.
   - **Allowance:** lookups to Google stop when the user's import allowance or the monthly Nearby cap runs out (§17); cache hits still answer. The remaining stops get no candidates (their "your places" still show), and the review says "Out of place lookups for now. 4 stops have no match: pick one of your places or drop a pin."
   - For each stop the response lists its "your places" and its candidates, and marks every one where the user already has a visit on the stop's local date (step 6).
   - **Measuring:** every stop is counted once, in the layer that answered it: local match, shared result, cache hit, sent to Google, or left unmatched by a limit; Google calls made (a 150 m retry counts twice) are counted too. The response returns the counts, the review shows them under its title ("Place lookups: 12 sent to Google, 85 avoided (60 your places, 18 shared, 7 cached)"), and the server stores them as one `import_log` row (§8: counts only, no locations).
6. **Already logged:** a stop whose match is a place where the user already has a visit on the stop's local date (matched by precision, as in My Visits' date filter, §14.3) is labelled "Already logged" and starts unchecked, so importing the same trip again doesn't duplicate visits. The label follows the chosen match; the checkbox is only preset.
7. **Review screen** (`src/components/import/`). Phones: full screen, over the tab bar. Desktop: a large panel over the map, right of the sidebar. It's modal: nothing behind it is reachable while it's open. Title "Review trip", the skipped-photos line (step 3), then the stops in time order, each a pixel card on `surface` with:
   - the date and time (in the place's zone), the photo count ("12 photos"), and a local thumbnail: the first photo's embedded EXIF thumbnail (read by the worker with exifr, metadata only) as an object URL, or the category sprite if it has none or the browser can't show it. Phone HEICs, PNGs, WebPs, and DNGs have none exifr can take (a ProRAW DNG's only preview is a full-size JPEG in IFD0, 5 MB, not an EXIF thumbnail), so those stops show the sprite. Each card makes its object URL as it appears and revokes it when it goes, which is when the review closes. The cards render a few at a time (one, then 4 per step, each step a React transition), so even 150 stops don't hold the page.
   - an **include** checkbox, checked except for "Already logged" stops and stops without a match (until lookups are built in 4.2 no stop has a match, so all start unchecked, the match area is a placeholder, and Save stays disabled);
   - the **match**, preselected (the nearest of the user's places within 50 m, else the first candidate) and switchable among the stop's candidates and its "Your places", each shown as on the confirmation card (sprite, name, city/country);
   - **Category** (the 14), starting at the user's category for one of their places, otherwise the candidate's auto category;
   - **"Drop a pin"** for a stop with no good match: the match becomes a new place at the stop's location with a required **Name** (at most 100 characters), as on a dropped pin's card (§11.4 step 3). No map placement: the photos' location is the pin;
   - **Rating** and **Note** (§11.5), optional, collapsed behind "Add rating & note" by default.
   - The date isn't editable here; it can be edited on the place page afterwards (§14.4).
   - At the bottom, **"Save N visits"** (N = checked stops with a match or a named pin; disabled at 0) and Close.
   - **Leaving with unsaved stops:** Close or Escape asks with the RPG dialog "Leave without saving?" / "Unsaved stops will be lost." (Leave / Stay). Reloading or closing the tab gets the browser's own warning.
8. **Batch save:** the checked stops save one at a time, in time order, through `/api/visits` ("Saving 3/12"), each like a normal visit (§11.6): a signed candidate, an existing place by id (one of the user's places), or a new manual place (§11.4 step 4); with source `photo`, no `source_input`, the stop's time (exact time, in the place's zone), and its category, rating, and note. The one-category-per-place rule applies (§8, §11.6 step 4), so when several stops share a place, the last one saved sets the category. A manual-place save from an import counts as an `import` lookup, not `nearby` (§17). A failed stop shows "Couldn't save this stop. Try again." and stays in the review, checked, so "Save" retries it; saved stops leave the review and stay saved.
   - **Idempotent:** each import has an id (a UUID made in the browser when grouping finishes), and every stop's save sends it with the stop's number. The server stores both on the visit (`import_id`, `import_stop`, §8). Before writing anything it looks for the user's visit with that import id and stop; if there is one, it answers with it as saved, so a retried save (a timeout, a lost response, a double tap) never creates a second visit or a second manual place. The unique index backs this up when two saves race.
9. **Afterwards:** one summary toast replaces the per-visit toasts: "Trip imported!" / "N places logged, M new countries" (`success`; "1 place", "1 new country"; N counts saved visits, M the saves that were a first visit in a country, §11.6 step 5). The new pins appear and the map fits to the imported pins (like the start view, §13.1). With failures, the toast counts what was saved and the review stays open with the failed stops; otherwise it closes.
10. As with Upload Photo, phone pickers and messaging apps often strip GPS (§11.2 step 7); those photos are skipped (step 3).
11. **Benchmark and docs:** `pnpm bench:import` (`scripts/bench-import.ts`, with its own `vitest.bench.config.mts`) runs a synthetic 300-photo trip (`scripts/synthetic-trip.ts`, fixed seed, so runs are repeatable: a week in Tokyo, hotel mornings and evenings, bursts of photos at spots, some without a location or date and a few unreadable) through the real grouping (4.1, plus a 500-photo trip) and the real lookup pipeline (4.2), with Google mocked (a fake `fetch`) and Supabase faked (the route tests' in-memory fake). It runs on Vitest (no new dependency), outside `pnpm test`, and prints photos, stops, grouping time, and Google calls made versus avoided by layer, for a cold cache and then a warm one. `docs/ARCHITECTURE.md` describes the pipeline (picker → worker → grouping → layered lookups → review → idempotent save) and the cost layers, with the benchmark's latest numbers.

---

## 12. External services

### 12.1 Google Places API (New)
- **Enable only** Places API (New) in Google Cloud.
- **Text Search:** `POST https://places.googleapis.com/v1/places:searchText` with `textQuery`, optional `locationBias.circle`, `pageSize: 3`, `languageCode: "en"`.
- **Nearby Search:** `POST https://places.googleapis.com/v1/places:searchNearby` with `locationRestriction.circle` (50 m, retry 150 m), `rankPreference: "DISTANCE"`, `maxResultCount: 3`, `languageCode: "en"`.
- `languageCode: "en"` returns names and addresses in English where Google has them. It is a request parameter, not a field, so it doesn't change the billed SKU (the field mask alone decides that).
- **Field mask (keep it minimal):**
  `places.id,places.displayName,places.primaryType,places.types,places.location,places.formattedAddress,places.addressComponents`
- **Never request** ratings, reviews, photos, phone numbers, websites, opening hours, price level, or similar. Those bill at the more expensive Enterprise rate.
- Before finalizing, confirm which pricing tier this field mask bills at in Google's docs (expected: Essentials/Pro). Free monthly allowances are per SKU: 10,000 (Essentials), 5,000 (Pro), 1,000 (Enterprise).
- **City** from `addressComponents`: `locality` → `postal_town` → `administrative_area_level_2` → `administrative_area_level_1`. **Tokyo exception:** if the country code is `JP` and `administrative_area_level_1` is "Tokyo" or "東京都", the city is "Tokyo" (Google gives Tokyo's wards, like "Shibuya", as the locality, which would split Tokyo into many cities). **Country** name and code (`shortText`) from the `country` component.

### 12.2 "Open in Google Maps" links
Use Google's official Maps URLs format (free, no API call):
`https://www.google.com/maps/search/?api=1&query=<url-encoded name>&query_place_id=<google_place_id>`
For manual places, use `query=<lat>,<lng>`.

### 12.3 Gemini (text parsing)
- Model: the current **Flash-Lite** model on the free tier (about 500 requests/day as of September 2026; check current limits). Handle 429s by falling back to raw-text search.
- Structured output (JSON schema), temperature 0.
- **Input:** the user's text, today's date, and the user's IANA time zone.
- **Output schema:**
```json
{
  "query": "string, the place search phrase",
  "location_hint": "string or null, e.g. 'Tokyo'",
  "visited": {
    "value": "YYYY-MM-DDTHH:mm | YYYY-MM-DD | YYYY-MM | null",
    "precision": "datetime | date | month | null"
  }
}
```
- Resolve relative dates ("last March", "two weeks ago") against today's date. If no date is mentioned, `value` and `precision` are null → default to now.
- **Privacy:** Google may use free-tier data to improve its products. Only the Type Location text is sent; notes, ratings, and photos never are.
- **Fallback provider:** Claude Haiku, behind the same interface (`lib/ai/parse.ts`), only if the owner enables it.

### 12.4 OpenFreeMap
Free vector tiles, no key. Start from one of its provided styles, then restyle (§13.2). Its required attribution (OpenFreeMap / OpenMapTiles / OpenStreetMap contributors) must be visible on the map.

### 12.5 Category mapping (Google types → Wanderdex categories)
Check `primaryType` first, then each entry in `types` in order; first match wins. Implement as a lookup table in `lib/categories.ts` (no AI) and unit test it.

| Category | Sprite | Google types (include suffix rules) |
|---|---|---|
| Food | `pin_food.png` | `restaurant`, any `*_restaurant`, `fast_food_restaurant`, `food_court`, `meal_takeaway`, `meal_delivery`, `bakery`, `deli`, `diner`, `sandwich_shop` |
| Cafe | `pin_cafe.png` | `cafe`, `coffee_shop`, `tea_house`, `cat_cafe`, `dog_cafe`, `dessert_shop`, `ice_cream_shop`, `juice_shop` |
| Bar | `pin_bar.png` | `bar`, `pub`, `wine_bar`, `bar_and_grill`, `brewery` |
| Museum | `pin_museum.png` | `museum`, `art_gallery`, `planetarium` |
| Landmark | `pin_landmark.png` | `tourist_attraction`, `historical_landmark`, `monument`, `cultural_landmark`, `historical_place`, `church`, `mosque`, `hindu_temple`, `synagogue`, `place_of_worship`, `observation_deck` |
| Park & Nature | `pin_park_nature.png` | `park`, `national_park`, `state_park`, `hiking_area`, `beach`, `garden`, `botanical_garden`, `campground`, `lake`, `mountain_peak`, `playground`, `fishing_charter`, `fishing_pier`, `fishing_pond` |
| Shopping | `pin_shopping.png` | `shopping_mall`, `market`, `supermarket`, `store`, any `*_store` |
| Stay | `pin_stay.png` | `lodging`, `hotel`, `hostel`, `motel`, `resort_hotel`, `bed_and_breakfast`, `guest_house`, `inn` |
| Entertainment | `pin_entertainment.png` | `movie_theater`, `amusement_park`, `night_club`, `bowling_alley`, `concert_hall`, `performing_arts_theater`, `stadium`, `arena`, `race_course`, `zoo`, `aquarium`, `casino`, `karaoke`, `video_arcade` |
| Sports | `pin_sports.png` | `gym`, `fitness_center`, `yoga_studio`, `sports_club`, `sports_complex`, `sports_coaching`, `sports_school`, `sports_activity_location`, `athletic_field`, `swimming_pool`, `tennis_court`, `golf_course`, `indoor_golf_course`, `ski_resort`, `ice_skating_rink`, `skateboard_park`, `cycling_park` (not `stadium`, `arena`, or `race_course`, which are Entertainment; `playground` is Park & Nature) |
| Campus | `pin_campus.png` | Google's Education types: `university`, `school`, `primary_school`, `secondary_school`, `preschool`, `library`, `academic_department`, `educational_institution`, `research_institute`, plus `school_district` |
| Airport | `pin_airport.png` | `airport`, `international_airport`, `airstrip`, `heliport` |
| City | `pin_city.png` | `locality`, `sublocality`, `sublocality_level_1`–`_5`, `neighborhood`, `postal_town`, `administrative_area_level_1`–`_7`, `colloquial_area` (`country` is Other) |
| Other | `pin_other.png` | Everything else, including `country` and the spa, sauna, and massage types |

Display labels: "Food", "Cafe", "Bar", "Museum", "Landmark", "Park & Nature", "Shopping", "Stay", "Entertainment", "Sports", "Campus", "Airport", "City", "Other". This order is used everywhere categories are listed (dropdowns, the legend, filter chips).

---

## 13. The Overworld (map)

### 13.1 Setup
- MapLibre GL JS, full-bleed in its container.
- **Hybrid pixel effect:** the map has two modes, switched by zoom.
  - **Pixel mode** (world view, below the threshold): one map pixel is a fixed **block size** of **3** CSS pixels (picked on a real phone), or **2** at the lowest zooms (below zoom 2, back to 3 only above 2.5), where the whole world is only a few hundred pixels wide; and `image-rendering: pixelated` is applied to the map canvas. The `pixelRatio` varies by device: it is `DPR / round(block × DPR)`, so each map pixel covers a whole number of device pixels, and it is recomputed when the device pixel ratio or the block size changes. Fill antialiasing is off. Country borders are crisp 1-map-pixel lines (a negative `line-blur` cancels MapLibre's line antialiasing). Disputed borders are hidden, since dashes can't be made crisp, and so are rivers (waterway lines); seas and lakes (water fills) stay. Any other line is a whole number of map pixels wide.
  - **Smooth mode** (zoomed in, from the threshold): full device pixel ratio, no pixelation, fill antialiasing on, normal line widths in CSS pixels that grow with zoom, dashed disputed borders, rivers shown, and all of Positron's road layers.
  - **Switch:** smooth at zoom ≥ the threshold of **5** (picked on a real phone), and back to pixel mode only below 4.5 (the threshold − 0.5, hysteresis). It happens when a movement ends, never mid-gesture, and snaps without animation. It uses MapLibre's `setPixelRatio` and `setPaintProperty`, never a remount or a style reload. Pixel mode's block size switches the same way.
- **Minimum zoom:** the map can't zoom out past the point where the world is as wide as the map container (`log2(width / 512)`, since MapLibre's world is 512 × 2^zoom CSS pixels wide). It is recomputed whenever the container resizes, including orientation changes, and the start view's fit respects it. MapLibre also stops at the zoom where the world is as tall as the map, so on a portrait phone that height limit is the one that applies.
- **Start view:** fit bounds to all of the user's places with padding (max zoom ~12, so a single pin isn't zoomed to street level). With no places, show the whole world (as much of it as the minimum zoom allows). On desktop the map runs full-bleed behind the floating sidebar (§14.1), so the camera is also padded on the left by the sidebar's width: the start view, flying to a new pin, and zooming all center on the part of the map the sidebar doesn't cover.
- Zoom controls styled as pixel buttons (+ / −), top-right, as in the sheet, with the legend button below them (§13.6).
- **Load failure:** if the map style request fails, MapLibre reports an error (a tile, a source) before the first full draw, or the map hasn't drawn within 20 s, "Loading..." gives way to the map error (§11.7). Its "Try again" builds the map afresh, without reloading the page. Errors after the first draw (a tile while panning offline) are only logged.

### 13.2 Map style
- Start from an OpenFreeMap style and recolor using **only palette tokens**: flat colors, no gradients, no hillshading, no 3D buildings. One approved exception: the building outlines' opacity (below).
  - Water: Map Ocean `#3E7774`
  - Land/background: Map Land `#8DAA63`
  - Country borders: Map Border `#6B6A5B`
  - Roads (visible when zoomed in): Surface Dark `#C9B995`; major roads Surface `#E7D8B7`
  - Parks/green areas: keep Map Land unless another palette color reads better
  - Buildings: flat 2D footprints from the tiles' building layer in Map Border `#6B6A5B`, from zoom 15 (so only in smooth mode), each with a thin outline (1px, 2px by zoom 18) in Text `#2D201C` at **60% opacity**, so touching buildings stay apart. The opacity is an approved exception to exact tokens only: no token sits between Text and Map Border, and full-strength Text is too heavy. No extrusion or 3D. Footprints and outlines are drawn above land and water and below every road, so streets stay readable.
- **Remove all text/label layers** (text turns to mush when pixelated). Place names appear only in our own HTML UI. With no text layers, the style doesn't need glyphs.
- POI icons off.

### 13.3 Visited countries
- Load `public/geo/countries.geojson` (Natural Earth admin-0, simplified; the source and steps to regenerate it are in the README) once the map has first drawn, without holding up the pins. If it fails to load, the map works without the fill.
- Match countries on the `ISO_A2_EH` property (plain `ISO_A2` is `-99` for some countries, such as France and Norway).
- Fill layer in Visited Country `#F5A830`, filtered to the user's distinct `country_code`s (from the places loaded for the pins), drawn above the land but below the water, so the tiles' seas and lakes hide any spill and the coastline is always the tiles' own; the borders stay on top. The shapes are grown slightly out to sea along the coasts, so no land gap shows there.
- **Only in the zoomed-out view:** the fill shows in pixel mode, with hard edges (fill antialiasing off), and hides in smooth mode. It switches with the mode (§13.1), so the pixelation and the fill always change together.
- A save adds its country to the fill at once. Deleting the last visit in a country removes it the next time the Overworld loads.

### 13.4 Pins (important implementation detail)
- **Pins must be HTML markers, not MapLibre symbol layers.** Everything drawn inside the map canvas gets pixelated by the low `pixelRatio`, which would destroy the 32×32 sprites. HTML markers sit above the canvas and stay crisp.
- Cluster with **supercluster** over the user's places; recompute on `moveend` (zooming fires it too); render only markers within the current viewport. The cluster radius grows with the pins: 40px below zoom 10, 80px from zoom 10 (supercluster is asked for one zoom lower), so nearby pins merge into a cluster instead of piling up.
- **Single place:** the category sprite with `image-rendering: pixelated`, anchored at the pin's bottom tip, growing with zoom so pins read well up close: **32px** below zoom 10, **64px** from zoom 10, **96px** from zoom 15. The selected pin is one step up: **64px**, **96px**, or **128px**. Whole multiples only (§16.5 rule 4). Sizes change when a movement ends, never mid-pinch. Every pin's tap target is at least 44px.
- **Cluster:** `pin_group.png` at the same size as single pins (32, 64, or 96px by zoom; it has no selected size) with a small dark badge on its top-right corner showing the count in the pixel font (cream text on `#2D201C`), capped at "99+". The count is 8px on 32px pins and 16px from zoom 10, and the badge grows with it. The sprite's white circle is too small for a number. Tapping a cluster zooms in to expand it.
- **One pin per place**, even with several visits.
- Tapping a pin opens a popup: a speech-bubble pixel card on `surface` with a stepped pixel tail pointing at the pin (pointing up instead when the card has to sit below the pin). Its content is left-aligned on one edge: the name; the category line (label first, then its sprite); city/country; a full-width 1px divider in `text`; the number of visits; then a "View" button → `/places/[id]` stretched to the card's width. The popup closes when the desktop confirmation panel opens, since the map controls move left of the panel and could end up over it.

### 13.5 Plan B
~~If the pixelated map proves unworkable on real devices, fall back to the same styled map **without** pixelation, inside a retro pixel frame.~~ **Decided 2026-09-30: not used.** After testing on real devices, the hybrid map (§13.1, pixelated at world zoom, smooth when zoomed in) was chosen over Plan B. See `DECISIONS.md`.

### 13.6 Map legend
- A pixel icon button (Pixelarticons, 44px) below the zoom buttons toggles a legend card. Closed by default. Escape closes it, and so does a tap or click on the map outside it (on the map or a pin; dragging or pinching doesn't).
- The card is a pixel card on `surface` titled "MAP LEGEND". It lists all 14 category sprites with their §12.5 labels, in that order, plus the cluster pin labelled "Group" and a 32px `visited` swatch labelled "Visited country". Compact: tight rows, labels in Small (desktop) or Tiny (phones), sprites at 32px (§16.7).
- Desktop: it opens beside the map controls, top-aligned with them, in one column. Phones: it opens below the map controls, across the map's width, in a two-column grid (16 entries, 8 rows). It never covers the zoom buttons, the legend button, the attribution, or the tab bar (the buttons stay tappable while it's open), and it scrolls inside only when it's taller than the space.

---

## 14. Screens, routes, and navigation

| Route | Screen |
|---|---|
| `/login` | Log in |
| `/signup` | Sign up |
| `/` | **Overworld**: map + add panel |
| `/visits` | **My Visits**: list + filters |
| `/places/[id]` | Place detail: place info + all of the user's visits there |
| `/profile` | **Profile**: stats + account (§14.6) |

### 14.1 Navigation
- **Desktop:** a left sidebar styled like the RPG dialog (§16.6): a floating box inset from the viewport edges by a margin, full height minus that margin, with a dark `text` fill, an `accent` pixel border with notched corners and small pixel corner ornaments, cream text, and a solid offset shadow. On the Overworld the map runs full-bleed behind it (§13.1); on other pages it floats over the page background, and the content starts to its right. Items, top to bottom: the passport logo + "WANDERDEX" (links to `/`; hover bounces the logo with a tiny pixel sparkle, press pushes it in; three quick clicks open the passport secret, §15.1, so its navigation waits ~350 ms), then **Overworld**, **Add Visit** as its subitem (indented beneath it, joined to it by a stepped pixel connector line in `accent`, always visible, no collapse), then **My Visits**, then a divider and, at the bottom, the user's initial in a pixel frame + username, which is the **profile** item (links to `/profile`, §14.6), and **Log out** (RPG confirm dialog). No separate Profile item, no Settings item, and no Settings page.
  - **RPG cursor:** a "▶" marker beside the item under the mouse, else the keyboard-focused one, else the current page's. The current page's item keeps the `primary` fill. The profile item behaves like the others (hover, press, cursor, `primary` on `/profile`).
  - **Hover and press:** hover lifts an item up-left onto a larger offset shadow; press pushes it flat (it moves by the full shadow offset and the shadow goes to 0), like the buttons. The shadow is `accent`, which shows on the dark box. Add Visit adds a call to action on hover (a pixel sparkle and a flat shine band), and on click its + icon spins round in steps.
  - **Add Visit** toggles the add bubble on the Overworld (§14.2). From another page it navigates to `/` and opens the bubble.
- **Mobile:** bottom tab bar with **Overworld**, **My Visits**, **Add Visit** (opens the drawer), with Pixelarticons icons and 8px Press Start 2P labels. Same visual language as the sidebar: dark fill down to the bottom screen edge (safe area), an `accent` pixel border along its top edge, the active tab in `accent` with the "▶" marker beside its icon, and a press animation on tap. Tabs stay at least 44px tall. A small **avatar button** (the user's initial in a pixel frame) in the top-right corner of the Overworld and My Visits opens `/profile`. There's no avatar menu: Log out lives in the profile's Account section (§14.6).

### 14.2 Overworld (`/`)
- **Desktop:** the map fills the window, full-bleed behind the floating sidebar. There is no always-visible add panel. Pressing Add Visit in the sidebar opens the add panel ("Add Anything") as a speech bubble next to the sidebar, its stepped pixel tail pointing at the Add Visit item: a cream pixel card on `surface` like the pin popup (§13.4). It holds the four mode buttons as a vertical menu, with the "▶" cursor on the hovered or focused one. Choosing a mode turns the same bubble into that mode's input (e.g. the link field + Find), with a Back button to the menu. After a successful lookup the bubble closes and the confirmation card opens as a side panel over the map, on the right (Trip Photos opens its review screen instead, §11.8). The bubble closes on Escape, a click outside it, or pressing Add Visit again; closing it clears its input.
- **Fit:** at 1280×800 (desktop) and 390×844 (iPhone), the add bubble, the add drawer, the confirmation card (with up to 3 candidates), and the map legend fit without scrolling inside. Smaller screens may scroll. The Trip Photos review (§11.8) is a list and scrolls.
- **Mobile:** full-screen map. A slide-up drawer holds the add panel (four mode buttons, in a 2×2 grid, since four across don't fit 375px) and becomes the confirmation card after a lookup (or opens the Trip Photos review).

### 14.3 My Visits (`/visits`)
- Sorted by `visited_at` descending (most recent visit first).
- **Header:** "My Visits" (H1), the subtitle "Every place you've explored." (Small), and a pixel divider line ending in a small `accent` sparkle ornament. No header icon. The page uses the background art (§16.7). On phones the avatar button (§14.1) sits at the right end of the title row, and the title is H2-sized there so both fit at 375px.
- Filters, spanning the full content width, laid out as in the sheet: a row of **category** chips, then a row of compact **City**, **Country**, and **Date** controls, and a "Clear filters" action whenever any filter is set. Fits 375px with no horizontal scrolling.
  - **Category chips:** "All" + the 14 categories (§12.5), multi-select. "All" means no category filter: choosing it clears the others, and turning off the last category turns it back on. Chosen chips are `accent` with dark text, like the add flow's choices; at least 44px tall. Below 640px: All, Food, Cafe + a "More" dropdown with the other 12 (as in the sheet); wider: every chip, wrapping.
  - **City / Country:** dropdowns of the user's own distinct values, plus "All cities" / "All countries". With a country chosen, the city list shows only that country's cities, and a chosen city that isn't one of them is cleared.
  - **Date:** opens a popover with From and To on one calendar (§16.6); either end can be left open ("Any"). Matches by precision, in each visit's own time zone: a month-only visit matches if any day of its month is in the range, a date-only visit if its day is, an exact-time visit by its local date.
  - Filtering runs on the server under the user's session (RLS), keeps the sort and "Load more", and lives in the URL query (`?category=food,cafe&country=…&city=…&from=YYYY-MM-DD&to=YYYY-MM-DD`), so reload and Back keep it.
  - No matches: "No visits match these filters." (§11.7) with a Clear filters button.
- **Rows:** full content width, each a thin pixel card on `surface`. Left: the category sprite (32px, where the sheet shows photos), then the place name with city/country beneath (both truncate with "…"). Then a vertical divider and a right block: a calendar icon + the date at its precision, and a star icon + the rating ("8/10", or "--" with none) (Pixelarticons). A right arrow at the far end.
  - The whole row is one link. Hover: `accent` border, a light `background` fill, and the hover lift (up-left onto a larger offset shadow); press pushes it flat; keyboard focus shows the accent outline.
  - **Narrow (phones):** no vertical divider; name and city/country on the left, date over rating on the right, then the arrow. Exact-time dates leave out the time (the place page keeps it). Rows stay at least 44px tall, with no horizontal scroll at 375px. The layout follows the list's width, not the window's.
- Tapping a row → `/places/[id]`, scrolled to that visit, which is briefly highlighted (2 s).
- Load 30 at a time, with a "Load more" button.
- No visits yet: "No visits yet, traveler. Your adventure starts on the Overworld!" on a pixel card on `surface`, with no filters. "No visits match these filters." (§11.7) sits on the same kind of card.

### 14.4 Place detail (`/places/[id]`)
- **Header:** category sprite (64px), name, address, city/country, the user's category for this place (a dropdown of the 14; changing it updates all of the user's visits for this place, §8, so their pin uses it), and an **"Open in Google Maps"** button (§12.2).
- The user's visits here, newest first, each with its date (to its precision, in the visit's time zone), rating (if any), and note.
- Each visit is **editable** (date, precision, rating, note) in an RPG-styled edit dialog with the confirmation card's controls and rules (§11.5), in the visit's stored time zone; the category is the header's. Each is **deletable** with the RPG confirm dialog: "Delete this visit? This can't be undone." Delete / Cancel. The place row is never deleted (§8).
- **"Add another visit"** button: opens the confirmation card on this page (wide desktop windows, from 1280px: side panel on the right, and the page narrows to end left of it so nothing hides behind it; narrower desktop windows, which have no room for both: in the page, right under the button, scrolled into view; phones: the drawer), with this place as the only candidate and its current category. It saves by the place's id (§11.6).
- If the user deletes their last visit here, go to `/visits`.
- If the place doesn't exist, the user can't read it, or they have no visits there: an RPG-style "not found" box with a link back to My Visits.
- **Phones:** a Back button at the top (to the previous page, or My Visits when the app opened on this page). **Desktop:** content sits to the right of the floating sidebar.
- Edits, deletes, and category changes go through server routes that check the session, validate with zod, and use the user's session client, so RLS applies (§9, §17).

### 14.5 Login / Sign up
As in the sheet (logo, "WANDERDEX", tagline "Collect places. Build your world."), minus email fields and "Forgot password?" (§10).

### 14.6 Profile (`/profile`)
- **Reached from** the desktop sidebar's profile item and the phone avatar button (§14.1). A cream page with the background art (§16.7); desktop content sits right of the sidebar. One column, fitting 375px.
- **Header:** the user's initial in a pixel frame (as in the sidebar), the username (H1 from `md`, H2 on phones), "Joined <Month YYYY>" (Small, from `profiles.created_at`), and the passport sprite at a whole-number scale, which is also the passport secret's trigger on every device (§15.1).
- **Stats** (pixel tiles on `surface`): **Places discovered** (distinct places the user has visits at), **Countries** X/195, **Continents** X/7, **Total visits**, **First visit** (the place of the earliest `visited_at`, linking to its page, and that date at its precision, in its zone). With no visits: zeros, and "--" for First visit.
- **Countries:** the 195 are the 193 UN member states plus Vatican City (`VA`) and Palestine (`PS`). For each visited place's `country_code`:
  - one of the 195 counts as itself;
  - a territory with a clear sovereign counts toward it (e.g. `HK`, `MO` → `CN`; `PR`, `GU` → `US`; `GF`, `RE` → `FR`);
  - a partially recognized or disputed place (e.g. `TW`, `XK`, `EH`) counts as itself and is never merged into another state;
  - Antarctica (`AQ`) counts toward no country; a place without a `country_code` doesn't count.
  - The denominator stays 195 (the disputed places could push the count past it only in theory).
- **Continents:** 7 (Africa, Antarctica, Asia, Europe, North America, Oceania, South America), from a static table by country code, using the UN geoscheme for transcontinental countries (e.g. Russia → Europe; Türkiye, Cyprus, and the Caucasus → Asia; Egypt → Africa). North America is the geoscheme's Northern America, Central America, and Caribbean. A territory counts for the continent it's on (French Guiana → South America), not its sovereign's.
- Both tables are static data modules in `src/lib/stats/`, unit tested: exactly 195 states, every ISO 3166-1 alpha-2 code (plus `XK`) classified, and the examples above.
- **Travel stats:**
  - **Pins per category:** a pixel-style bar chart (plain boxes in tokens, no chart library): a row per category that has pins, most first (ties in §12.5 order), each with its 32px sprite, label, a bar proportional to the count, and the count. A place counts once, under the user's category for it (the pin's, §8).
  - **Most revisited:** the top 5 places by the user's visit count, among places with at least 2 visits (ties: most recent visit first), each with sprite, name, city/country, and "N visits", linking to `/places/[id]`. None yet: "No return visits yet."
  - No recents section (My Visits covers it).
- **Account:**
  - **Change password:** Current password, New password, Confirm new password (min 6, max 72 characters, no other rules, §10), with the warning "Passwords can't be recovered. Pick one you'll remember." The server verifies the current password first (a sign-in with it); a wrong one shows "That's not your current password." and nothing changes. Success: toast "Password changed!"; the user stays logged in.
  - **Export data:** "Download CSV" and "Download JSON": the user's visits with place details, one row per visit, newest first: date (local, at its precision), precision, time zone, rating, note, category, source, source input, place name, address, city, country, country code, latitude, longitude, Google place id. The files are built in the browser from the user's own data, read on the server under their session (RLS, paging helper); nothing goes to any other service. Names: `wanderdex-visits-YYYY-MM-DD.csv` / `.json`.
  - **Delete account:** an RPG dialog, "Delete your account?" / "Your visits and private places will be deleted. This can't be undone.", with a field "Type <username> to confirm". "Delete account" stays disabled until the field matches the username. The server checks the session and the typed username, then, with the admin API (secret key): notes the user's private manual places (`created_by` = user, `google_place_id` null), deletes the auth user (which cascades, §8), then deletes those places. The user is signed out and sent to `/login`. Shared Google places stay.
  - **Log out:** the RPG confirm (§10). On phones this is the only Log out.
- **Data:** computed on the server under the user's session (RLS), with the existing paging helper (`readAllPages`). The stats are pure functions over the rows, unit tested.

---

## 15. Game touches
1. **"New place discovered!"** success toast on every save of a new place; **"Return visit!"** for a place the user already has visits at.
2. **"First visit to a new country!"** toast on a first-in-country save.
3. **RPG-style dialogs** for every dialog (logout, delete, edits, errors that need acknowledgment).
4. **Game-style copy** in empty and error states (§11.7).
5. **The passport secret** (Phase 4, §15.1).

Nothing else (no sounds, XP, levels, or stamps).

### 15.1 The passport secret
- **Triggers:** the desktop sidebar's passport logo, and the profile's passport sprite (every device, §14.6). Clicks (or taps, or Enter) within ~1.5 s of each other: the first wiggles the passport, the second flips it, the third opens the secret. Two clicks and then nothing do nothing more. The sidebar logo still links to `/`: its navigation waits ~350 ms after a click and happens only if no second click follows, so a single click still navigates. A modified click (Ctrl/Cmd, middle button) opens the link as usual and isn't counted.
- **The secret:** a modal overlay (the dialog overlay, §16.6) where the passport (the sprite at a whole-number scale) flips open with CSS 3D transforms (`rotateY` in `steps()`, so it moves in pixel-feeling frames) into a two-page spread of cream (`background`) pages with pixel borders, pixel sparkles, and a shine (a flat band, no gradient, like Add Visit's). Left page: **Countries** X/195 and **Continents** X/7. Right page: **Pins** (places) and **First pin** (name and date). The values are the profile's (§14.6): on the profile they're already loaded; from the sidebar they're fetched when the secret opens (a Server Function sharing the profile's code), with the loading dots in their place until they arrive.
- **Closing:** Escape, a click outside the spread, or a close button. An accessible dialog (on the Radix Dialog already installed): labelled "Passport", focus moves into it and stays there, and returns to the trigger on close.
- **Reduced motion:** no wiggle, flip, or opening animation; the third click shows the open spread at once, and the sparkles stay still.
- No animation library, no new dependencies, no sound. It's the one dialog not in the RPG style (§3).

---

## 16. Design system

### 16.1 Principles
- One design language everywhere: **retro 8-bit game**.
- Square corners. Solid offset shadows (no blur). No gradients. Chunky pixel borders.
- Fun but readable. Every screen must work on a 375px-wide phone and on desktop.

### 16.2 Color tokens (final)
| Token | Hex | Use |
|---|---|---|
| `background` | `#F2EBD0` | Page background |
| `surface` | `#E7D8B7` | Cards, panels (the sheet's `#E7D087` was garbled) |
| `surface-dark` | `#C9B995` | Darker surfaces; road color on the map |
| `text` | `#2D201C` | Main text. Matches the sprite outline color. |
| `primary` | `#C84F3D` | Primary buttons, links |
| `accent` | `#E57A2E` | Highlights, RPG dialog border, ghost button underline |
| `success` | `#4CAF68` | Success toasts |
| `error` | `#D65465` | Errors (kept pinker than primary so errors don't look like buttons) |
| `warning` | `#F9CB77` | Warning alerts (e.g. no location data) |
| `map-ocean` | `#3E7774` | Map water |
| `map-land` | `#8DAA63` | Map land |
| `map-border` | `#6B6A5B` | Country borders |
| `visited` | `#F5A830` | Visited-country fill; "first country" toast background |
| `on-primary` | `#F2EBD0` | Text on primary buttons (same as background) |

- Define these once as CSS variables, and map shadcn's variables (`--background`, `--primary`, `--destructive`, etc.) to them, so 8bitcn components pick them up. **No hard-coded colors anywhere else.**
- The sprites contain extra colors (purple, teal, blue). Those stay inside the sprites and are **not** UI tokens.

### 16.3 Contrast rules (checked)
| Pair | Ratio | Rule |
|---|---|---|
| Text on background | 13.2:1 | ✅ |
| Text on surface | 11.2:1 | ✅ |
| Cream on primary buttons | 3.8:1 | OK only for large chunky button text (Press Start 2P ≥16px) |
| Dark text on success | 5.7:1 | ✅ Toasts use **dark** text |
| Cream on success | 2.3:1 | ❌ Don't use |
| Dark text on warning | 10.4:1 | ✅ |
| Dark text on error | 4.0:1 | OK for alert text at ≥20px VT323 |
| Accent text on background | 2.5:1 | ❌ Ghost buttons use **text color with an accent underline** instead |

### 16.4 Typography
| Style | Font | Size | Use |
|---|---|---|---|
| H1 | Press Start 2P | 32px | Page titles, logo text |
| H2 | Press Start 2P | 24px | Section headers |
| H3 | Press Start 2P | 16px | Card titles (the sheet's 20px renders blurry; Press Start 2P needs multiples of 8) |
| Button | Press Start 2P | 16px | Buttons (8px only for mobile tab labels) |
| Body | VT323 | 20px | Main text, notes, inputs |
| Small | VT323 | 18px | Labels, secondary text |
| Tiny | VT323 | 16px | Captions, metadata. **Never smaller than 16px.** |

The sheet's "VT223" is a typo for VT323. Line height ~1.2 for VT323, ~1.5 for Press Start 2P.

### 16.5 Component rules (checklist for every UI element)
1. Uses only theme tokens and the two fonts.
2. Square corners, solid offset shadow (e.g. `4px 4px 0 var(--text)`), no gradients.
3. Tested at 375px wide; tap targets at least 44px tall. Exception: links inline in a line of text, like the map attribution's credit links (WCAG 2.5.8's inline exception).
4. Pixel fonts and sprites only at whole-number sizes (fonts per §16.4; sprites at 1×, 2×, 3×, 4×).
5. Only light CSS animations (e.g. `steps()` sprite-style motion). No heavy animation libraries. Respect `prefers-reduced-motion`.
6. Visible keyboard focus state in pixel style: a two-tone ring, a 4px `accent` outline around the element (outside its pixel border, if it has one) with a 2px `text` line around that, so at least one of the two reaches 3:1 on the light fills, the map's land and water, and the dark boxes alike.
7. Adjacent buttons use the shared button-group gap (`gap-button-group`, 28px, in rows and between wrapped or stacked rows), so their pixel borders and shadows never touch.

### 16.6 Component mapping
| Sheet element | Build with |
|---|---|
| Button (primary) | 8bitcn Button: `primary` fill, cream text, dark border + offset shadow |
| Button (secondary) | 8bitcn Button: `surface` fill, dark text and border |
| Button (ghost) | 8bitcn Button (ghost): dark text, accent underline |
| Text input / textarea | 8bitcn Input / Textarea |
| Dropdown | 8bitcn Select |
| Filter chips | 8bitcn Toggle Group (selected = `accent` with dark text, like the add flow's choices) |
| Rating selector 1–10 | Toggle Group of 10 small buttons (2×5 on mobile) |
| Card | 8bitcn Card on `surface` |
| RPG dialog | 8bitcn Dialog: dark `#2D201C` box, accent pixel border, cream text, "▶" marker on the focused choice |
| Toast | Sonner/8bitcn toast; success = `success` bg + dark text; first country = `visited` bg + dark text |
| Alerts | 8bitcn Alert; warning = `warning` bg; error = `error` bg; dark text + Pixelarticons icon |
| Date & time picker | shadcn/8bitcn Calendar in a Popover + a time input + the precision control |
| Mobile drawer | shadcn Drawer (Vaul), restyled |
| Sidebar | Custom, in the RPG dialog style (§14.1) |
| Bar chart (profile) | Custom: plain boxes in tokens with category sprites, no chart library (§14.6) |
| Passport secret | Custom on the Radix Dialog, CSS 3D transforms (§15.1) |
| Icons | Pixelarticons |

### 16.7 Assets (provided by the owner, placed in `public/sprites/`)
All are true pixel art at native size with no semi-transparent pixels; outline color `#2D201C`.

| File | Size | Use |
|---|---|---|
| `passport.png` | 32×32 | Logo (login, signup, sidebar); profile header and passport secret (§14.6, §15.1); favicon source |
| `airplane.png` | 48×18 | Decorative header art; includes its dotted trail |
| `pin_food.png` | 32×32 | Food pin |
| `pin_cafe.png` | 32×32 | Cafe pin |
| `pin_bar.png` | 32×32 | Bar pin |
| `pin_museum.png` | 32×32 | Museum pin |
| `pin_landmark.png` | 32×32 | Landmark pin |
| `pin_park_nature.png` | 32×32 | Park & Nature pin |
| `pin_shopping.png` | 32×32 | Shopping pin |
| `pin_stay.png` | 32×32 | Stay pin |
| `pin_entertainment.png` | 32×32 | Entertainment pin |
| `pin_sports.png` | 32×32 | Sports pin |
| `pin_campus.png` | 32×32 | Campus pin |
| `pin_airport.png` | 32×32 | Airport pin |
| `pin_city.png` | 32×32 | City pin |
| `pin_other.png` | 32×32 | Other pin |
| `pin_group.png` | 32×32 | Cluster pin (count goes in a corner badge) |
| `preview_8x.png`, `preview2_8x.png` | — | Previews only; not used in the app |
| `bg/map_fragment_americas.png` | 150×136 | Background art, top-left |
| `bg/map_fragment_asia_pacific.png` | 120×112 | Background art, right |
| `bg/compass.png` | 60×60 | Background art, bottom-left |
| `bg/airplane_trail.png` | 104×46 | Background art, top-right |
| `bg/passport_stamp.png` | 66×48 | Background art, bottom-right |
| `bg/sparkle_3.png`, `bg/sparkle_5.png` | 3×3, 5×5 | Background art, scattered near the other pieces |
| `bg/world_map.png` | 360×142 | Provided; not used (the layout uses the two fragments) |

The `bg/` pieces use their own soft colors (darker shades of the cream background, no outline). Like all sprite colors, these stay inside the sprites (§16.2).

**Background art:** the plain cream pages (`/login`, `/signup`, `/visits`, `/places/[id]`, `/profile`, not the Overworld) have a fixed layer of the `bg/` pieces behind the content. It stays put while the page scrolls, takes no pointer events, is hidden from assistive tech, and never causes horizontal scrolling. Each piece is anchored to a corner of the layer as in `docs/design/background-preview.png` (laid out at 1× in `background-composite.png`), at a whole-number scale picked by the layer's size: 2×, 3× from 840×696, 4× from 1500×928. No piece is stretched or cropped to fill. On desktop app pages the layer covers the area right of the sidebar. Phones (layer narrower than 640px or shorter than 464px) get only the compass, the stamp, and a few sparkles at 2×, in the corners the page's text leaves free: the top ones beside the logo on login/signup, the bottom ones (above the tab bar) on app pages.

Always render with `image-rendering: pixelated` at whole-number multiples (32, 64, 96, 128px). Food, Museum, and Shopping pins are all reds and are told apart by icon only; this is accepted. (Cafe was a fourth red until its sprite was redrawn in brown, 2026-10-06.) Category sprites also replace photo thumbnails in cards and lists, except the Trip Photos review's local thumbnails (§11.8), which fall back to the sprite.

### 16.8 Toast behavior
Toasts auto-dismiss after ~4 s and have a close (×) button. Copy is in §11.6 and §11.7. They appear at the top; when a save shows two, both are fully visible, "New place discovered!" (or "Return visit!") first. On phones they sit left of the avatar button (Overworld, My Visits), so they cover neither it nor the tab bar. A Trip Photos import shows one summary toast instead of one per visit (§11.8).

### 16.9 Where the design sheet is overridden
1. No email field, no "Email or username", no "Forgot password?" link.
2. The signup warning is about no recovery, not "include a number".
3. Photo thumbnails → category sprites (except the Trip Photos review, §11.8).
4. H3 = 16px, not 20px. VT323 sizes bumped (body 20px, minimum 16px).
5. Surface = `#E7D8B7`; Text = `#2D201C`; Warning `#F9CB77` added; Error stays `#D65465`.
6. No Settings page; the sidebar shows an initial avatar (linking to the profile, §14.6) + Log out.
7. The sheet's pink "First visit to a new country!" alert uses `visited` instead (pink-red is reserved for errors).
8. The sheet's RPG "You found a new place! Add it to your passport?" dialog is **not** used on save; the RPG style is used for all other dialogs.
9. The rating selector wraps to 2×5 on mobile.
10. The app name is Wanderdex, not "Travel Passport".
11. The desktop sidebar follows the RPG dialog style (dark box, accent pixel border, cream text, "▶" cursor) and floats over the map, instead of the sheet's flush dark panel (§14.1).
12. Desktop: Add Visit is a subitem of Overworld, above My Visits, and opens the add panel as a speech bubble beside the sidebar, instead of the sheet's "Add Anything" panel docked along the bottom of the map (§14.1, §14.2).
13. Selected filter chips on My Visits are `accent` with dark text, like the add flow's choices, instead of the sheet's red (§14.3, §16.6).

---

## 17. Security and cost controls
- Secret keys only in server code and Vercel env vars. Never prefixed `NEXT_PUBLIC_`.
- **Google Cloud, day one:** API key restricted to Places API (New) only; a **budget alert** (e.g. $5) on the billing account; **daily quota caps** of **150/day for Text Search** (`SearchTextRequest`) and **500/day for Nearby Search** (`SearchNearbyRequest`; higher because one Trip Photos import can make up to 300 Nearby calls, §11.8). Google requires a card on file, which is why these matter. While the billing account is on the Free Trial, the Places API (New) quota settings are locked; set the caps when upgrading (see `DECISIONS.md`). The app's own monthly caps (below) stay the main protection.
- Field masks limited as in §12.1.
- **Per-user rate limit** on `/api/resolve/*` and on manual-place saves (they call Nearby Search, §11.4): before any work, check, then log each one in `resolve_log` (`kind` `link`, `text`, or `nearby`); reject with the rate-limit error (`rate_limited`, 429, §11.7) once the user has **60 in the last hour or 300 in the last 24 hours**. Rejected requests aren't logged. Only these three kinds count here; `import` rows don't.
- **Trip import allowance** (§11.8): each lookup an import sends to Google (one per shared group of stops; its 150 m retry doesn't add one; local matches and cache hits don't count) and each manual-place save from an import (source `photo`) is logged in `resolve_log` with kind `import`. At most **150 stops per import**, and **300 import lookups per user in the last 24 hours**. The 60/hour and 300/day lookup limits above don't apply to imports, and imports don't use them up. When the allowance runs out mid-import, the remaining stops get no Google candidates (§11.8 step 5), and an import's manual-place save skips Nearby Search and uses the country-shapes fallback (as at the monthly cap, §11.4), so its pins stay saveable. Every Google call still counts toward, and is stopped by, the monthly SKU caps below.
- **Global monthly cap per Google SKU** (built): **4,500 calls/month** each for Text Search and Nearby Search, per calendar month (UTC), counting actual Google API calls across all users in `google_call_log` (a Nearby retry at 150 m counts as two calls; a manual-place save's Nearby calls count too). Before each Google call, if its SKU has reached the cap, the call is skipped and a lookup stops with the rate-limit error; a manual-place save instead uses its country-shapes fallback (§11.4), so pins stay saveable. Otherwise the call is logged and made. Google's free allowance is 5,000 per SKU; the margin covers simultaneous requests slightly overshooting.
- **Shared lookup cache** (Phase 4): every Nearby Search (Trip Photos, Upload Photo, a dropped pin's city and country, and a coordinates-only link, which use the same lookup) checks `nearby_cache` (§8) before calling Google. The key is the point's cell: latitude and longitude rounded to a fixed step (a config constant, about 20 m). A hit younger than **30 days** answers without a Google call, with its candidates re-sorted by distance to the actual point and signed fresh (the cache never holds signatures). An empty result (nothing within 150 m) is cached too, but answers only for **7 days**, since a new place may open there. A miss calls Google (50 m, then 150 m) and upserts the cell with the result. Older rows (past 30 days, or empty and past 7) are ignored and replaced; each cache write also deletes rows past 30 days. Both ages are config constants, next to the cell size (below). Server only, with the secret key; no user id is stored. A hit makes no Google call, so it isn't logged in `google_call_log`, isn't stopped by the monthly cap, and doesn't use the import allowance. The per-user lookup limits still count requests to `/api/resolve/*` and pin saves, hit or miss. Text Search isn't cached.
- **Cost measurement:** each Trip Photos import stores how its stops were answered (local match, shared result, cache hit, Google, unmatched) and its Google calls in `import_log` (§8, §11.8 step 5). `pnpm bench:import` reports the same for a synthetic trip (§11.8 step 11).
- All limits live in one config file, `src/lib/rate-limits.ts` (the import limits too). Trip Photos' photo limit, reading concurrency, and grouping, matching, grid, and cache values (cell size and the two ages) live in their own config file in `src/lib/trip/` (§11.8).
- Account deletion uses the admin API with the secret key, on the server only, after the session check (§14.6).
- All route handlers check the Supabase session and validate input with zod.
- RLS on every table (§9).
- Photos never leave the browser.
- No secrets in the public repo: `.env*` git-ignored; `.env.example` has names only.

---

## 18. Operations
- **Hosting:** Vercel, connected to the GitHub repo. `main` deploys to production; pull requests get preview deployments.
- **Supabase keep-alive:** free projects pause after 7 days of inactivity. `.github/workflows/keepalive.yml` runs on a cron (e.g. `0 12 */3 * *`) and calls `GET /api/health` with the `HEALTH_PING_TOKEN` header; the endpoint runs a trivial database query.
- **Migrations:** SQL files in `supabase/migrations/`, applied by hand in the Supabase SQL Editor, in file-name order (README).
- **Attribution:** map data credit visible on the Overworld.

---

## 19. Testing and QA
- **Unit tests (Vitest):**
  - Link parsing: every URL form in §11.1 with real samples, plus failure cases.
  - Category mapping: each category, suffix rules, `primaryType` priority, fallback to Other.
  - Dates: precision formatting, month/date storage at 12:00 local, EXIF with and without offset, time zone conversion.
  - Username validation.
  - Photo reading (§11.2): RAW files (DNG and the camera formats, by type and extension), partial reads (only the metadata part of a large JPEG, DNG, PNG, or WebP is read, and a GPS block past the first chunk is still found), and EXIF thumbnails.
  - Trip Photos (§11.8): skipping (no GPS, no date, unreadable), grouping into stops (distance, time gap, same-day merge, time order, centroid, first photo's time, time zone day boundaries, the 500-photo and 150-stop limits), the worker's protocol (batches, progress, results, failures, cancelling), the grid index (same answers as comparing every pair, including across cell edges and at high latitudes), sharing lookups within 50 m, the local-first match, the lookup cache (cell rounding, hit, miss, 30-day expiry, re-sorting, empty results and their 7-day expiry), the per-layer counts, "Already logged" by precision, and an idempotent save (a repeated save of one stop leaves one visit and one manual place).
  - Country and continent tables (§14.6): exactly 195 states, every ISO 3166-1 code classified, the listed examples; the profile stats.
- **Manual device checklist (every phase):**
  - Phone at 375px (Chrome and Safari) and desktop (Chrome).
  - Add via each mode, including a photo with GPS and one without.
  - Pins crisp, clusters work, visited countries fill, map pans to a new pin.
  - Every dialog uses the RPG style; toasts show the correct colors and copy.
  - Tap targets ≥44px; no horizontal scrolling on mobile.
  - Log out and back in; data persists.
  - Phase 4: a Trip Photos import from the phone's own photo picker (iPhone Safari included) and by drag-and-drop on desktop; the profile, its account actions, and the passport secret, with and without reduced motion.
- **Performance:** Overworld usable within ~3 s on a mid-range phone; smooth panning with ~300 places.

---

## 20. Build plan and timeline

The owner is in a rush. Target roughly **two weeks** for the core build; these are targets, not deadlines.

### Phase 1: Foundation (≈ days 1–5): done
- Accounts: Supabase project; Google Cloud (Places API (New), key restriction, budget alert, quota caps); Gemini API key; Vercel; GitHub repo.
- Scaffold Next.js + TypeScript + Tailwind + shadcn/ui + 8bitcn; fonts; tokens (§16.2); sprites in `public/sprites/`; favicon.
- Supabase: migrations (§8), RLS (§9), auth settings (§10).
- Login, signup, logout (RPG dialog), route protection.
- Paste Link and Type Location modes → confirmation card → save.
- Basic My Visits list.
- Overworld: pixelated MapLibre with a recolored OpenFreeMap style, labels off, HTML pins with clustering, fit-to-pins start view.
- `/api/health` + keep-alive workflow. Deploy to Vercel.
- **Done when:** a user can sign up, add a place by link and by text, and see it in the list and as a crisp pin on the pixelated map, on phone and desktop, in production.

### Phase 2: Full features (≈ days 6–10): done
- Upload Photo mode (exifr), including the "no location data" path.
- Ratings, notes, partial dates + precision, time zones.
- Place detail page; edit and delete visits (RPG dialogs); per-user category edit.
- Filters on My Visits.
- Visited-country fill.
- Manual pin fallback.
- Toasts: new place + first country.
- Per-user rate limiting and the global monthly Google caps (§17).
- **Done when:** every feature in §3 works end to end and the unit tests in §19 pass.

### Phase 3: Polish (≈ days 11–14): done (2026-10-05)
- Mobile drawer and bottom tab bar finalized; desktop sidebar finalized.
- Every component passes the checklist (§16.5); contrast rules (§16.3) applied.
- Empty and error states (§11.7).
- Tune the hybrid map on real phones (world-view block size, smooth threshold). Done 2026-09-30: block 3, smooth from zoom 5; Plan B not used (§13.5).
- Manual QA checklist (§19) on phone and desktop.
- README with setup steps (PowerShell commands).
- **Done when:** the app matches the design sheet (with §16.9 overrides) and passes the QA checklist.

### Phase 4: Trip Photos, Profile, passport secret: not started
- **4.1 Trip Photos: reading, grouping, and the review screen** (§11.8 steps 1–4 and 7), local only, no lookups yet. Every push deploys to production, so until 4.2 is finished the mode shows only in development builds: one flag, `TRIP_PHOTOS_ENABLED` in `src/lib/trip/config.ts` (`NODE_ENV === "development"`), removed when 4.2 is done. With the flag off, the drawer keeps its three modes side by side. **First:** a quick check on the owner's iPhone that a multi-select from Safari's picker keeps GPS (single photos already do, §22). Done 2026-10-06: 38 picked, all 36 regular photos read with location and date; the 2 ProRAW DNGs were refused by the file-type check, now supported (§11.2). Then the fourth mode, multi-select and drop, the reading Web Worker with bounded concurrency and progress, skipping and its summary, grouping, the review with stops, thumbnails, and the leave warning; and the benchmark's synthetic trip generator with its grouping report.
- **4.2 Trip Photos: lookups and saving** (§11.8 steps 5–6 and 8–11, §17), in this order:
  1. The migration: `nearby_cache`, `import_log`, and `visits.import_id` / `import_stop` with their unique index (§8, §9). Stop until the owner confirms it's applied.
  2. `/api/resolve/import`: the grid index for local matches and shared results, the import allowance, "Already logged", and the per-layer counts stored in `import_log`.
  3. The shared lookup cache, used by every Nearby Search (imports, Upload Photo, dropped pins).
  4. Idempotent batch save, the lookup counts in the review, the summary toast, and fitting the map to the new pins.
  5. The benchmark's lookup report (cold and warm cache) and `docs/ARCHITECTURE.md`.
- **4.3 Profile: stats and navigation** (§14.6, §14.1): the page, its stats and travel stats, the country and continent tables, the sidebar's profile item, the phone avatar button on the Overworld and My Visits (the avatar menu goes away).
- **4.4 Profile: account actions** (§14.6): change password, export data, delete account, log out. Confirm that `google_call_log.user_id` is `on delete set null` in the live database (it is in `20261004000000_google_call_log.sql`); a migration is needed only if it isn't.
- **4.5 Passport secret** (§15.1).
- **Done when:**
  - A trip's photos import as visits on phone and desktop, with no photo data leaving the device (checked in the network log, as in Phase 2) and no duplicates on re-import ("Already logged") or on a retried save (idempotency).
  - The page stays responsive while 500 photos are read: no main-thread task over 100 ms in a performance trace.
  - Each import's calls made versus avoided show in its review and land in `import_log`; a repeat lookup at a cached spot makes no Google call.
  - `pnpm bench:import` prints the synthetic 300-photo report (cold and warm cache), and `docs/ARCHITECTURE.md` describes the pipeline with those numbers.
  - The profile's numbers match the user's data, every account action works end to end, and the secret opens from both triggers, on phone and desktop.
  - `pnpm lint`, `pnpm build`, and `pnpm test` pass.

---

## 21. Later (out of scope for the core build)
Passport stamps · timeline replay · saving photos to entries · AI vision to rank photo candidates · sound effects (off by default) · XP / levels · dark mode · optional recovery email.

---

## 22. Known risks
| Risk | Mitigation |
|---|---|
| Google terms gray area (storing Places data, §1.3), now including the shared Nearby cache (`nearby_cache`, 30-day expiry, §17), which Google's terms are stricter about than storing place IDs | Accepted for a personal project; revisit before any public launch (the cache can be dropped without changing behavior, only cost) |
| Google/Apple change link formats | Parser isolated in `lib/links`, unit tested, graceful fallback to Type Location |
| Apple changes its place page or objects to reading it (§11.1) | Falls back to Type Location; accepted for a personal project |
| Photos often lack GPS | Clear "no location data" path; the date is still used |
| Supabase free project pausing | Keep-alive ping every ~3 days |
| Gemini free-tier limits change | Fall back to raw-text search; Claude Haiku as backup provider |
| Simple passwords | Supabase auth rate limits on |
| No password recovery | Clear signup warning |
| Pixelated map unreadable on some phones | Hybrid map: pixelated only at world zoom, full resolution when zoomed in (§13.1); block size and threshold picked on a real phone |
| Crisp world-view borders rely on a negative `line-blur`, which MapLibre's style spec doesn't allow | MapLibre pinned at 5.x. After any MapLibre upgrade, check the world-view borders; if they break, fall back to plain 1-map-pixel lines |
| Google bill | Budget alert, quota caps, minimal field masks, per-user rate limits |
| iPhone Safari's photo picker may strip GPS when many photos are picked at once | Owner checked both: single photos and a 38-photo multi-select from the Photos library keep GPS and dates (2026-10-06); skipped photos are counted and reported (§11.8) |
| One big import can make up to 300 Nearby calls (150 stops, each with a retry) | Google's daily Nearby cap is 500 (§17); local matches, shared lookups, and the cache cut calls; stops past a limit get no match and can still be pinned |
| Reading hundreds of photos on a phone | Metadata only (partial reads, never whole files), a few files at a time, in a Web Worker, at most 500 per import |
| Account deletion can't be undone | RPG confirm with the username typed in (§14.6) |

---

## 23. Costs
| Item | Cost |
|---|---|
| Supabase | $0 (free: 500 MB DB, 50,000 MAU; Pro is $25/mo if ever needed) |
| Vercel | $0 |
| Google Places | $0 at personal scale (free monthly allowance per SKU) |
| Gemini Flash-Lite | $0 (free tier) |
| OpenFreeMap, Natural Earth, MapLibre | $0 |
| 8bitcn, shadcn/ui, Pixelarticons, fonts | $0 |
| GitHub Actions ping | $0 |
| Domain | None (Vercel subdomain) |

---

## 24. Open items
None. (Resolved: the Vercel subdomain is `wanderdex.vercel.app`.)
