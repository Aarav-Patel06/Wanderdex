# Wanderdex

A personal travel passport styled like a retro 8-bit game. Paste a Google or Apple Maps link, type a place, or pick a photo, and it lands as a pixel pin on your Overworld map.

Built with Next.js, Supabase, MapLibre, Google Places, and Gemini. The full spec is in [`docs/SPEC.md`](docs/SPEC.md); choices made along the way are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Prerequisites

- **Node.js 22** (`node -v` should print `v22.x`)
- **pnpm 12**. If you don't have it: `npm install -g pnpm@12`. The exact version is pinned in `package.json` (`packageManager`), and pnpm switches to it by itself.
- Accounts (all free tiers): **Supabase**, **Google Cloud** (Places API (New)), **Google AI Studio** (Gemini), **Vercel**, and this **GitHub** repo.

All commands below work in Windows PowerShell 5.1.

## Local setup

```powershell
git clone https://github.com/Aarav-Patel06/Wanderdex.git
cd Wanderdex
pnpm install
Copy-Item .env.example .env.local
```

Then fill in `.env.local` (it's git-ignored; never commit it).

### Environment variables

[`.env.example`](.env.example) lists every name. Only the two `NEXT_PUBLIC_` ones are public; everything else is a server-side secret and must never get a `NEXT_PUBLIC_` prefix.

| Name | What it's for | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project (browser and server) | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Signed-in requests under Row Level Security | Supabase → Project Settings → API Keys (publishable key; older projects: `anon`) |
| `SUPABASE_SECRET_KEY` | Server only: writes shared places, signup, rate-limit logs, `/api/health` | Supabase → Project Settings → API Keys (secret key; older projects: `service_role`) |
| `GOOGLE_PLACES_API_KEY` | Server only: Places API (New) Text Search and Nearby Search | Google Cloud → APIs & Services → Credentials (see below) |
| `GEMINI_API_KEY` | Server only: reads Type Location text | Google AI Studio → Get API key |
| `RESOLVE_SIGNING_SECRET` | Server only: signs every lookup result, so a save can't invent a shared place. Without it, lookups and saves fail. Changing it invalidates confirmation cards that are open (they're valid for 24 h). | Any long random string (see below) |
| `HEALTH_PING_TOKEN` | Bearer token for `GET /api/health`, the keep-alive target. Same value in Vercel and in the GitHub secret. Empty = every ping is refused. | Any long random string (see below) |
| `ANTHROPIC_API_KEY` | Not used. Reserved for the optional Claude Haiku fallback, which isn't built. Leave empty. | — |

To make a random secret in PowerShell (64 hex characters), run this once for each of `RESOLVE_SIGNING_SECRET` and `HEALTH_PING_TOKEN`:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
```

### Database (Supabase)

Migrations are applied **by hand** in the Supabase SQL Editor (the Supabase CLI isn't used). Run each file **once**, **in this order**:

| # | File | What it does |
|---|---|---|
| 1 | [`20260928000000_init.sql`](supabase/migrations/20260928000000_init.sql) | Types, the `profiles` / `places` / `visits` / `resolve_log` tables, indexes, the `updated_at` trigger, and Row Level Security |
| 2 | [`20260929000000_tighten_grants.sql`](supabase/migrations/20260929000000_tighten_grants.sql) | Revokes Supabase's default table privileges and grants back only what signed-in users need |
| 3 | [`20261004000000_google_call_log.sql`](supabase/migrations/20261004000000_google_call_log.sql) | The `google_call_log` table for the monthly Google cap (server only) |

For each file: copy it to the clipboard, then in Supabase open **SQL Editor** → **New query**, paste, and click **Run**.

```powershell
Get-Content supabase\migrations\20260928000000_init.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20260929000000_tighten_grants.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261004000000_google_call_log.sql -Raw | Set-Clipboard
```

(Run one line, paste and run it in Supabase, then the next line.)

Auth settings (SPEC §10), under Supabase → Authentication:

- **Email confirmations: off** (Sign In / Providers → Email → "Confirm email"). Usernames sign in with a hidden `<username>@wanderdex.local` email, which can't receive mail.
- **Rate limits: on** (the defaults are fine).

### Google Cloud (Places API)

1. Create a project and enable **only** Places API (New).
2. Create an API key and restrict it to Places API (New) (APIs & Services → Credentials → the key → API restrictions).
3. Add a **budget alert** (e.g. $5) on the billing account.
4. Once the billing account is upgraded from the Free Trial (the quota settings are locked until then), set daily quota caps of 150/day on `SearchTextRequest` and `SearchNearbyRequest` (APIs & Services → Places API (New) → Quotas).

The app also limits itself: 60 lookups an hour and 300 a day per user, and 4,500 Google calls a month per SKU across all users (`src/lib/rate-limits.ts`, SPEC §17).

### Gemini

Create a key in Google AI Studio (free tier). If Gemini fails or hits its limit, Type Location falls back to searching the raw text, so the app keeps working without it.

## Running

```powershell
pnpm dev     # dev server at http://localhost:3000
pnpm test    # unit tests (Vitest)
pnpm lint    # ESLint
pnpm build   # production build
pnpm start   # serve the production build locally (after pnpm build)
```

To try it on a phone on the same Wi-Fi, open the **Network** address that `pnpm dev` prints (e.g. `http://192.168.1.20:3000`). To check the production build on a phone, run `pnpm build`, then `pnpm start -H 0.0.0.0`, and open `http://<this PC's IP>:3000` (`ipconfig` shows the IPv4 address). Don't run `pnpm dev` and `pnpm start` on the same port at once: on Windows, requests can land on either server.

### Country shapes

[`public/geo/countries.geojson`](public/geo/countries.geojson) (the visited-country fill, SPEC §13.3, and the country of a dropped pin when Google has nothing nearby) is made from Natural Earth's 1:50m admin-0 countries (public domain), release v5.1.2. It keeps only `ISO_A2_EH`, is grown 8 km out to sea along the coasts (not across land borders; the map's water hides the excess), and is simplified to about 5 km. To regenerate it, from the repo root (mapshaper runs once through `pnpm dlx`; it isn't a dependency):

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson -OutFile "$env:TEMP\ne_50m_admin_0_countries.geojson"
pnpm dlx mapshaper@0.7.72 -i "$env:TEMP\ne_50m_admin_0_countries.geojson" -filter-fields ISO_A2_EH -buffer 8km topological quad-segs=2 -simplify interval=5000 keep-shapes -o public/geo/countries.geojson precision=0.01
```

These two commands reproduce the committed file byte for byte; `git status` should show no change afterwards.

## Deployment

Production runs on Vercel (Hobby), connected to this repo: pushes to `main` deploy to production, and pull requests get preview deployments. No `vercel.json` is needed: Vercel picks pnpm from the lockfile, pnpm switches itself to the pinned version, and `engines` in `package.json` selects Node 22.

Under the Vercel project's **Settings → Environment Variables**, add every variable from `.env.local` except `ANTHROPIC_API_KEY`, with the same values (`RESOLVE_SIGNING_SECRET` and `HEALTH_PING_TOKEN` can be new random strings, but `HEALTH_PING_TOKEN` must then match the GitHub secret below). Redeploy after changing a variable.

### Supabase keep-alive

Free Supabase projects pause after 7 days without activity. [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) calls the production `GET /api/health` every 3 days (`0 12 */3 * *`, 12:00 UTC), which runs a trivial database query. It needs, under the GitHub repo's Settings → Secrets and variables → Actions:

- **Secret** `HEALTH_PING_TOKEN`: the same value as in Vercel.
- **Variable** `SITE_URL`: the production URL, e.g. `https://wanderdex.vercel.app`.

The run fails on anything but HTTP 200. To run it by hand: Actions tab → **Supabase keep-alive** → **Run workflow**. To check the endpoint from PowerShell:

```powershell
Invoke-RestMethod https://wanderdex.vercel.app/api/health -Headers @{ Authorization = "Bearer <HEALTH_PING_TOKEN>" }
```

It answers `ok : True`. A wrong or missing token gives a 401.

**The 60-day rule: GitHub disables scheduled workflows in public repos after 60 days without repository activity** (commits count; the workflow's own runs don't). GitHub emails a warning first. Once it's disabled, Supabase will pause about a week later. To turn it back on: open the repo's **Actions** tab, pick **Supabase keep-alive** in the left list, click **Enable workflow** on the banner, then **Run workflow** once to check that it passes. If the Supabase project has already paused, restore it from the Supabase dashboard first.
