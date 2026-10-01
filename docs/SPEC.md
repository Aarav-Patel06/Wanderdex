# Wanderdex: Project Specification

**Version:** 1.0 (2026-09-28)
**Status:** Pre-build. Core build (Phases 1–3) is in scope; everything in §21 "Later" is out of scope.
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

Wanderdex is a web app that works as a personal travel passport. Users log places they've visited by pasting a Google or Apple Maps link, typing a plain-language description, or uploading a photo. The app identifies the place, sorts it by category, city, and country, and shows every place on a zoomable, pixelated 8-bit world map called the **Overworld**. Users can rate each visit 1–10 and add notes. The whole UI is styled like a retro 8-bit video game, and it must work well on both phones and desktops.

### 1.1 Goals
1. Adding a place takes seconds and usually needs only one tap to confirm.
2. The app feels fun and game-like, with one consistent design language.
3. Works well on mobile (from 375px wide) and desktop.
4. Runs on free tiers for a personal-scale project.

### 1.2 Non-goals (for the core build)
Social features, sharing, public profiles, photo storage, stats, stamps, dark mode, native apps, email of any kind, password recovery.

### 1.3 Scope note on Google data
Storing Google Places data (names, coordinates, addresses, types) in our own database is a gray area under Google Maps Platform terms. The owner has **accepted this for a personal student project**. If Wanderdex ever becomes a public product, this must be revisited (options: open data like OpenStreetMap, or re-fetching from Google instead of storing).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Overworld** | The map screen (`/`). Name taken from the game term for a world map. |
| **Place** | A real-world location (a cafe, a museum). Shared across users when it comes from Google. |
| **Visit** | One user's record of going to a place, with date, rating, and note. A place can have many visits. |
| **Add panel** | The UI for adding a visit, with three modes: Paste Link, Upload Photo, Type Location. |
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
| Add modes | Three separate modes: Paste Link, Upload Photo, Type Location |
| Partial dates | Allowed (`datetime`, `date`, `month`), stored with a precision flag |
| Displayed time zone | The place's local time zone |
| Save flow | Save from the confirmation card, then a "New place discovered!" toast ("Return visit!" for a place the user already has visits at). No extra confirm dialog on save. |
| Dialog style | **Every** dialog in the app uses the RPG style |
| Text parsing AI | Gemini Flash-Lite (free tier). Fallback: Claude Haiku if free limits become a problem. |
| Categories | Fixed list of 10 (§12.5), no custom categories |
| Username | 3–20 chars, `a–z 0–9 _`, not case-sensitive (stored lowercase) |
| Password | Minimum 6 characters, no other rules, confirm field at signup, **no recovery** |
| Sessions | Stay logged in until logout |
| Edit/delete | All visit fields editable; delete asks for confirmation in an RPG dialog |
| Visits list sort | Most recent visit date first |
| Photos | Read in the browser only. **Never uploaded or stored.** |
| Body font | VT323 |
| Dark mode | Not in core build (Later list) |
| Build method | Claude Code builds; a separate Claude chat handles design decisions and reviews |
| Package manager | pnpm |
| Repo | Public GitHub repo `wanderdex`, no secrets committed |
| Hosting | Vercel free tier, `wanderdex.vercel.app` (or closest available) |
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
| Photo metadata | **exifr** | Runs in the browser; supports HEIC |
| Coordinates → time zone | A tz lookup library (e.g. `@photostructure/tz-lookup`) | Offline, no API |
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
 ├─ Add panel: Paste Link | Upload Photo (exifr, local only) | Type Location
 └─ Supabase client (reads/writes the user's own data under RLS)
        │
        ▼
Next.js server (Vercel)
 ├─ /api/resolve/link    → expand link, parse, Google Text Search
 ├─ /api/resolve/text    → Gemini parse, Google Text Search
 ├─ /api/resolve/nearby  → Google Nearby Search (photo GPS / manual pin)
 ├─ /api/visits (save)   → upsert place (secret key) or reuse one by id, + insert visit
 ├─ /api/visits/[id]    → edit / delete one visit (session client, RLS)
 ├─ /api/places/[id]/category → the user's category for a place (their visits only)
 └─ /api/health          → trivial DB query (keep-alive target)
        │
        ├─► Supabase Postgres (profiles, places, visits, resolve_log)
        ├─► Google Places API (New)   [secret key, server only]
        └─► Gemini API                [secret key, server only]

Map tiles: browser → OpenFreeMap directly (no key)
Country shapes: served as a static file from /public/geo/
```

Rule: **all secret keys stay on the server.** The browser only ever sees the Supabase URL and the publishable key.

---

## 6. Repository structure (suggested)

```
wanderdex/
├─ docs/
│  ├─ SPEC.md
│  ├─ DECISIONS.md
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
│  │  └─ api/...                      # route handlers (§5)
│  ├─ components/
│  │  ├─ ui/              # shadcn + 8bitcn components
│  │  ├─ map/             # Overworld, markers, cluster badge
│  │  ├─ add/             # add panel, modes, confirmation card
│  │  └─ dialogs/         # RPG dialog wrapper
│  ├─ lib/
│  │  ├─ supabase/        # server + browser clients
│  │  ├─ google/          # Places API calls, field masks
│  │  ├─ ai/              # Gemini parse + schema
│  │  ├─ links/           # link parsing (unit tested)
│  │  ├─ categories.ts    # Google type → category map (unit tested)
│  │  ├─ dates.ts         # precision + time zone logic (unit tested)
│  │  └─ photo.ts         # exifr reading
│  └─ styles/globals.css  # tokens
├─ supabase/migrations/   # SQL (§8, §9)
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
  'park_nature','shopping','stay','entertainment','other'
);

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
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index visits_user_visited_idx on visits (user_id, visited_at desc);
create index visits_user_place_idx   on visits (user_id, place_id);

-- For per-user rate limiting of lookups
create table resolve_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                  -- 'link' | 'text' | 'nearby'
  created_at timestamptz not null default now()
);
create index resolve_log_user_time_idx on resolve_log (user_id, created_at desc);
```

**Why `category` is on `visits`:** `places` is shared across users, so one user's category edit must not change it for everyone. `places.category` is the auto-detected default; each visit copies it at creation. When a user edits the category on a place detail page, update **all of that user's visits for that place**, so their pin stays consistent. The pin uses that category.

**Dates:**
- `visited_at` is stored in UTC, computed from the local time plus `timezone`.
- `month` precision stores the 1st of the month at 12:00 local time; `date` precision stores 12:00 local time. The UI hides the unknown parts ("Mar 2025", "Mar 12, 2025").
- `timezone` comes from the place's coordinates (tz lookup library).

**Other notes:**
- Rows are tiny (~1 KB per visit), so the free 500 MB database holds hundreds of thousands of visits.
- `updated_at` is maintained by a trigger.
- Deleting a visit never deletes the shared place row.

---

## 9. Row Level Security

Enable RLS on every table.

| Table | Rule |
|---|---|
| `profiles` | A user can read only their own row. All writes happen on the server. |
| `places` | Logged-in users can read rows where `google_place_id is not null`, **or** where `created_by = auth.uid()` (manual places are private to their creator). **No insert/update from the browser**; the server inserts with the secret key. |
| `visits` | A user can select, insert, update, and delete only rows where `user_id = auth.uid()`. |
| `resolve_log` | No browser access. Server only. |

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
- **Log out:** confirmed with an RPG dialog ("Leave the Overworld?" Yes / No).
- **Route protection:** logged-out users are redirected to `/login`; logged-in users visiting `/login` or `/signup` go to `/`.

---

## 11. Adding a visit

The add panel has **three separate modes** (as in the design sheet): **Paste Link**, **Upload Photo**, **Type Location**. There is no auto-detection between modes. A manual fallback is always reachable.

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
1. The user picks or drops one image (JPEG, PNG, HEIC, WebP).
2. **Read metadata in the browser with exifr**: GPS latitude/longitude, `DateTimeOriginal`, `OffsetTimeOriginal`. **The image is never uploaded, stored, or sent anywhere.** Only coordinates and the date go to the server.
3. **No GPS** → warning alert "This photo has no location data." with "Type where it was taken instead.", then switch to Type Location, **pre-filling the photo's date** if it had one.
4. **Has GPS** → Google Nearby Search, radius 50 m, ranked by distance, max 3 results. If none, retry once at 150 m. If still none, offer the manual pin fallback, pre-placed at the photo's coordinates.
5. **Date:** use `DateTimeOriginal` (precision `datetime`). If `OffsetTimeOriginal` exists, use it; otherwise interpret the time in the place's time zone. **No date** → default to now.
6. Expect GPS to be missing often: phone browser photo pickers and messaging apps frequently strip location data. This is expected behavior, not a bug.

### 11.3 Type Location (server: `/api/resolve/text`)
1. Send the text to Gemini with today's date and the user's current time zone (for relative dates like "last March").
2. Gemini returns JSON (validated with zod), per §12.3.
3. Google Text Search with `query` (+ `location_hint` appended if present). Up to 3 candidates.
4. **If Gemini fails, times out, or hits a rate limit** → search with the raw text and default the date to now. The AI step must never block the flow.
5. **The AI only interprets text. It never supplies facts** (addresses, coordinates, whether a place exists). Facts come from Google.

### 11.4 Manual fallback (drop a pin)
Reachable from every mode ("Can't find it? Drop a pin"). The user taps a spot on the map, types a name, and picks a category. City/country come from a Nearby Search at that point (first result's address components); if there are none, the country is derived from the Natural Earth shapes by point-in-polygon and city stays empty. Creates a `places` row with `google_place_id = null` and `created_by = user`.

### 11.5 Confirmation card
Shown after any successful lookup:
- **Candidates:** up to 3, each with category sprite, name, and city/country. The first is preselected; one tap switches.
- **Date & time:** pre-filled (from the photo, the parsed text, or now), with a precision control: exact time / date only / month only, a segmented toggle that starts at the parsed precision (exact time when it defaults to now). Date only hides the time; month only picks just a month and year. Changing the date or time keeps the chosen precision. Saved per §8.
- **Category:** auto-set from Google types (§12.5), editable (dropdown of the 10).
- **Rating:** optional 1–10 selector, 44px cells. Desktop: one row of 10. **Mobile: two rows of 5** (ten 44px tap targets don't fit across 375px). Tapping the chosen number again clears it.
- **Note:** optional, up to 2000 characters. It starts one line tall and grows as you type; a character count shows near the limit.
- **Phones:** Rating and Note start collapsed behind an "Add rating & note" button, which shows both in place, so the card fits (§14.2) and a plain save stays one tap. Desktop shows them from the start.
- **Buttons:** "Save visit" (primary), "Cancel" (secondary), and a "Can't find it? Drop a pin" link.

### 11.6 Saving (`/api/visits`)
1. Re-validate input on the server (zod), and check the place's signature: every candidate from `/api/resolve/*` is signed on the server (HMAC-SHA256 with `RESOLVE_SIGNING_SECRET`) over all the place fields the save uses, with a 24-hour expiry. A missing, wrong, or expired signature saves nothing and shows "The map spirits aren't answering. Try again." Only the user's choices (category, date/time, precision, rating, note) are unsigned. Rating is a whole number 1–10 or none; the note is trimmed, at most 2000 characters, and an empty note is none. Without the secret, lookups and saves fail.
   - **Existing place, by id:** a save may instead name a place that already exists by its `id` (place detail's "Add another visit", §14.4, and manual places, §11.4). Nothing about the place is written, so there's no signature: the server only checks that the place exists and that the user can read it under RLS (§9), using the user's session. These visits are saved with source `manual` and no `source_input`.
2. Upsert the place by `google_place_id` with the secret key (insert if new, otherwise reuse). A save by id skips this.
3. Compute `timezone` from coordinates and `visited_at` in UTC.
4. Insert the visit with the chosen category.
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
| No visits yet (Overworld) | RPG dialog-style hint: "Your adventure starts here. Add your first place!", as a speech bubble whose tail points at Add Visit (the sidebar item on desktop, the tab on mobile), with a "Later" button. Later hides it until the Overworld next loads; pressing Add Visit does too. |
| No visits match filters | "No visits match these filters." |

Messages that need acknowledgment use the RPG dialog. Non-blocking messages use toasts or alerts.

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
| Park & Nature | `pin_park_nature.png` | `park`, `national_park`, `state_park`, `hiking_area`, `beach`, `garden`, `botanical_garden`, `campground`, `lake`, `mountain_peak` |
| Shopping | `pin_shopping.png` | `shopping_mall`, `market`, `supermarket`, `store`, any `*_store` |
| Stay | `pin_stay.png` | `lodging`, `hotel`, `hostel`, `motel`, `resort_hotel`, `bed_and_breakfast`, `guest_house`, `inn` |
| Entertainment | `pin_entertainment.png` | `movie_theater`, `amusement_park`, `night_club`, `bowling_alley`, `concert_hall`, `performing_arts_theater`, `stadium`, `zoo`, `aquarium`, `casino`, `karaoke`, `video_arcade` |
| Other | `pin_other.png` | Everything else |

Display labels: "Food", "Cafe", "Bar", "Museum", "Landmark", "Park & Nature", "Shopping", "Stay", "Entertainment", "Other".

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

### 13.2 Map style
- Start from an OpenFreeMap style and recolor using **only palette tokens**: flat colors, no gradients, no hillshading, no 3D buildings.
  - Water: Map Ocean `#3E7774`
  - Land/background: Map Land `#8DAA63`
  - Country borders: Map Border `#6B6A5B`
  - Roads (visible when zoomed in): Surface Dark `#C9B995`; major roads Surface `#E7D8B7`
  - Parks/green areas: keep Map Land unless another palette color reads better
- **Remove all text/label layers** (text turns to mush when pixelated). Place names appear only in our own HTML UI. With no text layers, the style doesn't need glyphs.
- POI icons off.

### 13.3 Visited countries
- Load `public/geo/countries.geojson` (Natural Earth admin-0, simplified).
- Match countries on the `ISO_A2_EH` property (plain `ISO_A2` is `-99` for some countries, such as France and Norway).
- Fill layer in Visited Country `#F5A830`, filtered to the user's distinct `country_code`s, drawn below the borders.

### 13.4 Pins (important implementation detail)
- **Pins must be HTML markers, not MapLibre symbol layers.** Everything drawn inside the map canvas gets pixelated by the low `pixelRatio`, which would destroy the 32×32 sprites. HTML markers sit above the canvas and stay crisp.
- Cluster with **supercluster** over the user's places; recompute on `moveend`/`zoomend`; render only markers within the current viewport. The cluster radius grows with the pins: 40px below zoom 10, 80px from zoom 10 (supercluster is asked for one zoom lower), so nearby pins merge into a cluster instead of piling up.
- **Single place:** the category sprite with `image-rendering: pixelated`, anchored at the pin's bottom tip, growing with zoom so pins read well up close: **32px** below zoom 10, **64px** from zoom 10, **96px** from zoom 15. The selected pin is one step up: **64px**, **96px**, or **128px**. Whole multiples only (§16.5 rule 4). Sizes change when a movement ends, never mid-pinch. Every pin's tap target is at least 44px.
- **Cluster:** `pin_group.png` at the same size as single pins (32, 64, or 96px by zoom; it has no selected size) with a small dark badge on its top-right corner showing the count in the pixel font (cream text on `#2D201C`), capped at "99+". The count is 8px on 32px pins and 16px from zoom 10, and the badge grows with it. The sprite's white circle is too small for a number. Tapping a cluster zooms in to expand it.
- **One pin per place**, even with several visits.
- Tapping a pin opens a popup: a speech-bubble pixel card on `surface` with a stepped pixel tail pointing at the pin (pointing up instead when the card has to sit below the pin). Its content is left-aligned on one edge: the name; the category line (label first, then its sprite); city/country; a full-width 1px divider in `text`; the number of visits; then a "View" button → `/places/[id]` stretched to the card's width.

### 13.5 Plan B
~~If the pixelated map proves unworkable on real devices, fall back to the same styled map **without** pixelation, inside a retro pixel frame.~~ **Decided 2026-09-30: not used.** After testing on real devices, the hybrid map (§13.1, pixelated at world zoom, smooth when zoomed in) was chosen over Plan B. See `DECISIONS.md`.

### 13.6 Map legend
- A pixel icon button (Pixelarticons, 44px) below the zoom buttons toggles a legend card. Closed by default.
- The card is a pixel card on `surface` titled "MAP LEGEND". It lists all 10 category sprites with their §12.5 labels, in that order, plus the cluster pin labelled "Group". Compact: tight rows, labels in Small (desktop) or Tiny (phones), sprites at 32px (§16.7).
- Desktop: it opens beside the map controls, top-aligned with them, in one column. Phones: it opens below the map controls, across the map's width, in a two-column grid. It never covers the zoom buttons, the legend button, the attribution, or the tab bar (the buttons stay tappable while it's open), and it scrolls inside only when it's taller than the space.

---

## 14. Screens, routes, and navigation

| Route | Screen |
|---|---|
| `/login` | Log in |
| `/signup` | Sign up |
| `/` | **Overworld**: map + add panel |
| `/visits` | **My Visits**: list + filters |
| `/places/[id]` | Place detail: place info + all of the user's visits there |

### 14.1 Navigation
- **Desktop:** a left sidebar styled like the RPG dialog (§16.6): a floating box inset from the viewport edges by a margin, full height minus that margin, with a dark `text` fill, an `accent` pixel border with notched corners and small pixel corner ornaments, cream text, and a solid offset shadow. On the Overworld the map runs full-bleed behind it (§13.1); on other pages it floats over the page background, and the content starts to its right. Items, top to bottom: the passport logo + "WANDERDEX" (links to `/`; hover bounces the logo with a tiny pixel sparkle, press pushes it in), then **Overworld**, **Add Visit** as its subitem (indented beneath it, joined to it by a stepped pixel connector line in `accent`, always visible, no collapse), then **My Visits**, then a divider and, at the bottom, the user's initial in a pixel frame + username, and **Log out** (RPG confirm dialog). No Profile or Settings items, and no Settings page.
  - **RPG cursor:** a "▶" marker beside the item under the mouse, else the keyboard-focused one, else the current page's. The current page's item keeps the `primary` fill.
  - **Hover and press:** hover lifts an item up-left onto a larger offset shadow; press pushes it flat (it moves by the full shadow offset and the shadow goes to 0), like the buttons. The shadow is `accent`, which shows on the dark box. Add Visit adds a call to action on hover (a pixel sparkle and a flat shine band), and on click its + icon spins round in steps.
  - **Add Visit** toggles the add bubble on the Overworld (§14.2). From another page it navigates to `/` and opens the bubble.
- **Mobile:** bottom tab bar with **Overworld**, **My Visits**, **Add Visit** (opens the drawer), with Pixelarticons icons and 8px Press Start 2P labels. Same visual language as the sidebar: dark fill down to the bottom screen edge (safe area), an `accent` pixel border along its top edge, the active tab in `accent` with the "▶" marker beside its icon, and a press animation on tap. Tabs stay at least 44px tall. Log out lives in a small menu button (user initial) in the top-right corner of the Overworld.

### 14.2 Overworld (`/`)
- **Desktop:** the map fills the window, full-bleed behind the floating sidebar. There is no always-visible add panel. Pressing Add Visit in the sidebar opens the add panel ("Add Anything") as a speech bubble next to the sidebar, its stepped pixel tail pointing at the Add Visit item: a cream pixel card on `surface` like the pin popup (§13.4). It holds the three mode buttons as a vertical menu (Upload Photo disabled until Phase 2), with the "▶" cursor on the hovered or focused one. Choosing a mode turns the same bubble into that mode's input (e.g. the link field + Find), with a Back button to the menu. After a successful lookup the bubble closes and the confirmation card opens as a side panel over the map, on the right. The bubble closes on Escape, a click outside it, or pressing Add Visit again; closing it clears its input.
- **Fit:** at 1280×800 (desktop) and 390×844 (iPhone), the add bubble, the add drawer, the confirmation card (with up to 3 candidates), and the map legend fit without scrolling inside. Smaller screens may scroll.
- **Mobile:** full-screen map. A slide-up drawer holds the add panel (three mode buttons) and becomes the confirmation card after a lookup.

### 14.3 My Visits (`/visits`)
- Sorted by `visited_at` descending (most recent visit first).
- Filters: **category** chips (All + 10 categories; on narrow screens show the first few + a "More" dropdown, as in the sheet), **city**, **country**, **date range**.
- Each row: category sprite (where the sheet shows photos), place name, city/country, rating (if any), date formatted to its precision.
- Tapping a row → `/places/[id]`, scrolled to that visit, which is briefly highlighted.
- Load 30 at a time ("Load more" or infinite scroll).

### 14.4 Place detail (`/places/[id]`)
- **Header:** category sprite (64px), name, address, city/country, the user's category for this place (a dropdown of the 10; changing it updates all of the user's visits for this place, §8, so their pin uses it), and an **"Open in Google Maps"** button (§12.2).
- The user's visits here, newest first, each with its date (to its precision, in the visit's time zone), rating (if any), and note.
- Each visit is **editable** (date, precision, rating, note) in an RPG-styled edit dialog with the confirmation card's controls and rules (§11.5), in the visit's stored time zone; the category is the header's. Each is **deletable** with the RPG confirm dialog: "Delete this visit? This can't be undone." Delete / Cancel. The place row is never deleted (§8).
- **"Add another visit"** button: opens the confirmation card on this page (desktop: side panel on the right; phones: the drawer), with this place as the only candidate and its current category. It saves by the place's id (§11.6).
- If the user deletes their last visit here, go to `/visits`.
- If the place doesn't exist, the user can't read it, or they have no visits there: an RPG-style "not found" box with a link back to My Visits.
- **Phones:** a Back button at the top (to the previous page, or My Visits when the app opened on this page). **Desktop:** content sits to the right of the floating sidebar.
- Edits, deletes, and category changes go through server routes that check the session, validate with zod, and use the user's session client, so RLS applies (§9, §17).

### 14.5 Login / Sign up
As in the sheet (logo, "WANDERDEX", tagline "Collect places. Build your world."), minus email fields and "Forgot password?" (§10).

---

## 15. Game touches (core build only)
1. **"New place discovered!"** success toast on every save of a new place; **"Return visit!"** for a place the user already has visits at.
2. **"First visit to a new country!"** toast on a first-in-country save.
3. **RPG-style dialogs** for every dialog (logout, delete, edits, errors that need acknowledgment).
4. **Game-style copy** in empty and error states (§11.7).

Nothing else (no sounds, XP, levels, or stamps) in the core build.

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
| `primary` | `#C84F3D` | Primary buttons, selected chips, links |
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
3. Tested at 375px wide; tap targets at least 44px tall.
4. Pixel fonts and sprites only at whole-number sizes (fonts per §16.4; sprites at 1×, 2×, 3×, 4×).
5. Only light CSS animations (e.g. `steps()` sprite-style motion). No heavy animation libraries. Respect `prefers-reduced-motion`.
6. Visible keyboard focus state in pixel style (e.g. accent outline).

### 16.6 Component mapping
| Sheet element | Build with |
|---|---|
| Button (primary) | 8bitcn Button: `primary` fill, cream text, dark border + offset shadow |
| Button (secondary) | 8bitcn Button: `surface` fill, dark text and border |
| Button (ghost) | 8bitcn Button (ghost): dark text, accent underline |
| Text input / textarea | 8bitcn Input / Textarea |
| Dropdown | 8bitcn Select |
| Filter chips | 8bitcn Toggle Group (selected = `primary`) |
| Rating selector 1–10 | Toggle Group of 10 small buttons (2×5 on mobile) |
| Card | 8bitcn Card on `surface` |
| RPG dialog | 8bitcn Dialog: dark `#2D201C` box, accent pixel border, cream text, "▶" marker on the focused choice |
| Toast | Sonner/8bitcn toast; success = `success` bg + dark text; first country = `visited` bg + dark text |
| Alerts | 8bitcn Alert; warning = `warning` bg; error = `error` bg; dark text + Pixelarticons icon |
| Date & time picker | shadcn/8bitcn Calendar in a Popover + a time input + the precision control |
| Mobile drawer | shadcn Drawer (Vaul), restyled |
| Sidebar | Custom, in the RPG dialog style (§14.1) |
| Icons | Pixelarticons |

### 16.7 Assets (provided by the owner, placed in `public/sprites/`)
All are true pixel art at native size with no semi-transparent pixels; outline color `#2D201C`.

| File | Size | Use |
|---|---|---|
| `passport.png` | 32×32 | Logo (login, signup, sidebar); favicon source |
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
| `pin_other.png` | 32×32 | Other pin |
| `pin_group.png` | 32×32 | Cluster pin (count goes in a corner badge) |
| `preview_8x.png`, `preview2_8x.png` | — | Previews only; not used in the app |

Always render with `image-rendering: pixelated` at whole-number multiples (32, 64, 96, 128px). Food, Cafe, Museum, and Shopping pins are all reds and are told apart by icon only; this is accepted. Category sprites also replace photo thumbnails in cards and lists.

### 16.8 Toast behavior
Toasts auto-dismiss after ~4 s and have a close (×) button. Copy is in §11.6 and §11.7. They appear at the top; when a save shows two, both are fully visible, "New place discovered!" (or "Return visit!") first. On phones they sit left of the Overworld's avatar button, so they cover neither it nor the tab bar.

### 16.9 Where the design sheet is overridden
1. No email field, no "Email or username", no "Forgot password?" link.
2. The signup warning is about no recovery, not "include a number".
3. Photo thumbnails → category sprites.
4. H3 = 16px, not 20px. VT323 sizes bumped (body 20px, minimum 16px).
5. Surface = `#E7D8B7`; Text = `#2D201C`; Warning `#F9CB77` added; Error stays `#D65465`.
6. No Settings page; the sidebar shows an initial avatar + Log out.
7. The sheet's pink "First visit to a new country!" alert uses `visited` instead (pink-red is reserved for errors).
8. The sheet's RPG "You found a new place! Add it to your passport?" dialog is **not** used on save; the RPG style is used for all other dialogs.
9. The rating selector wraps to 2×5 on mobile.
10. The app name is Wanderdex, not "Travel Passport".
11. The desktop sidebar follows the RPG dialog style (dark box, accent pixel border, cream text, "▶" cursor) and floats over the map, instead of the sheet's flush dark panel (§14.1).
12. Desktop: Add Visit is a subitem of Overworld, above My Visits, and opens the add panel as a speech bubble beside the sidebar, instead of the sheet's "Add Anything" panel docked along the bottom of the map (§14.1, §14.2).

---

## 17. Security and cost controls
- Secret keys only in server code and Vercel env vars. Never prefixed `NEXT_PUBLIC_`.
- **Google Cloud, day one:** API key restricted to Places API (New) only; a **budget alert** (e.g. $5) on the billing account; **daily quota caps** on Text Search and Nearby Search (e.g. 150/day each: `SearchTextRequest` and `SearchNearbyRequest`). Google requires a card on file, which is why these matter. While the billing account is on the Free Trial, the Places API (New) quota settings are locked; set the caps when upgrading (see `DECISIONS.md`).
- Field masks limited as in §12.1.
- **Per-user rate limit** on `/api/resolve/*`: log each call in `resolve_log`; reject above **60/hour or 300/day** per user (adjustable).
- **Global monthly cap per Google SKU** (Phase 2, with the per-user limit): about **4,500 calls/month** each for Text Search and Nearby Search, counting actual Google API calls across all users (a Nearby retry at 150 m counts as two calls). When a cap is hit, lookups return the rate-limit error. `resolve_log` counts lookups per user, not Google calls per SKU, so this likely needs a small migration.
- All route handlers check the Supabase session and validate input with zod.
- RLS on every table (§9).
- Photos never leave the browser.
- No secrets in the public repo: `.env*` git-ignored; `.env.example` has names only.

---

## 18. Operations
- **Hosting:** Vercel, connected to the GitHub repo. `main` deploys to production; pull requests get preview deployments.
- **Supabase keep-alive:** free projects pause after 7 days of inactivity. `.github/workflows/keepalive.yml` runs on a cron (e.g. `0 12 */3 * *`) and calls `GET /api/health` with the `HEALTH_PING_TOKEN` header; the endpoint runs a trivial database query.
- **Migrations:** SQL files in `supabase/migrations/`, applied with the Supabase CLI or the SQL editor.
- **Attribution:** map data credit visible on the Overworld.

---

## 19. Testing and QA
- **Unit tests (Vitest):**
  - Link parsing: every URL form in §11.1 with real samples, plus failure cases.
  - Category mapping: each category, suffix rules, `primaryType` priority, fallback to Other.
  - Dates: precision formatting, month/date storage at 12:00 local, EXIF with and without offset, time zone conversion.
  - Username validation.
- **Manual device checklist (every phase):**
  - Phone at 375px (Chrome and Safari) and desktop (Chrome).
  - Add via each mode, including a photo with GPS and one without.
  - Pins crisp, clusters work, visited countries fill, map pans to a new pin.
  - Every dialog uses the RPG style; toasts show the correct colors and copy.
  - Tap targets ≥44px; no horizontal scrolling on mobile.
  - Log out and back in; data persists.
- **Performance:** Overworld usable within ~3 s on a mid-range phone; smooth panning with ~300 places.

---

## 20. Build plan and timeline

The owner is in a rush. Target roughly **two weeks** for the core build; these are targets, not deadlines.

### Phase 1: Foundation (≈ days 1–5)
- Accounts: Supabase project; Google Cloud (Places API (New), key restriction, budget alert, quota caps); Gemini API key; Vercel; GitHub repo.
- Scaffold Next.js + TypeScript + Tailwind + shadcn/ui + 8bitcn; fonts; tokens (§16.2); sprites in `public/sprites/`; favicon.
- Supabase: migrations (§8), RLS (§9), auth settings (§10).
- Login, signup, logout (RPG dialog), route protection.
- Paste Link and Type Location modes → confirmation card → save.
- Basic My Visits list.
- Overworld: pixelated MapLibre with a recolored OpenFreeMap style, labels off, HTML pins with clustering, fit-to-pins start view.
- `/api/health` + keep-alive workflow. Deploy to Vercel.
- **Done when:** a user can sign up, add a place by link and by text, and see it in the list and as a crisp pin on the pixelated map, on phone and desktop, in production.

### Phase 2: Full features (≈ days 6–10)
- Upload Photo mode (exifr), including the "no location data" path.
- Ratings, notes, partial dates + precision, time zones.
- Place detail page; edit and delete visits (RPG dialogs); per-user category edit.
- Filters on My Visits.
- Visited-country fill.
- Manual pin fallback.
- Toasts: new place + first country.
- Per-user rate limiting and the global monthly Google caps (§17).
- **Done when:** every feature in §3 works end to end and the unit tests in §19 pass.

### Phase 3: Polish (≈ days 11–14)
- Mobile drawer and bottom tab bar finalized; desktop sidebar finalized.
- Every component passes the checklist (§16.5); contrast rules (§16.3) applied.
- Empty and error states (§11.7).
- Tune the hybrid map on real phones (world-view block size, smooth threshold). Done 2026-09-30: block 3, smooth from zoom 5; Plan B not used (§13.5).
- Manual QA checklist (§19) on phone and desktop.
- README with setup steps (PowerShell commands).
- **Done when:** the app matches the design sheet (with §16.9 overrides) and passes the QA checklist.

---

## 21. Later (out of scope for the core build)
Passport stamps · stats page · timeline replay · saving photos to entries · importing a whole trip's photos at once (grouping by time and place) · AI vision to rank photo candidates · sound effects (off by default) · XP / levels · dark mode · optional recovery email.

---

## 22. Known risks
| Risk | Mitigation |
|---|---|
| Google terms gray area (storing Places data) | Accepted for a personal project; revisit before any public launch |
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
- Final Vercel subdomain (`wanderdex.vercel.app` if available).
