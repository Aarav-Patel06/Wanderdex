# Wanderdex

A personal travel passport styled like a retro 8-bit game. Paste a Google or Apple Maps link or type a place, and it lands as a pixel pin on your Overworld map.

Built with Next.js, Supabase, MapLibre, Google Places, and Gemini. The full spec is in [`docs/SPEC.md`](docs/SPEC.md); choices made along the way are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Prerequisites

- **Node.js 22** (`node -v` should print `v22.x`)
- **pnpm 12**. If you don't have it: `npm install -g pnpm@12`. The exact version is pinned in `package.json` (`packageManager`), and pnpm switches to it by itself.
- A **Supabase** project (free tier), a **Google Cloud** key for Places API (New), and a **Gemini** API key (free tier). See SPEC §12 and §17 for how each one is restricted.

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

[`.env.example`](.env.example) lists every name. Only the first two are public; everything else is a server-side secret and must never get a `NEXT_PUBLIC_` prefix.

| Name | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (publishable key) |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys (secret key) |
| `GOOGLE_PLACES_API_KEY` | Google Cloud → APIs & Services → Credentials |
| `GEMINI_API_KEY` | Google AI Studio |
| `RESOLVE_SIGNING_SECRET` | Any long random string (see below) |
| `HEALTH_PING_TOKEN` | Any long random string (see below) |
| `ANTHROPIC_API_KEY` | Leave empty (only for the optional Claude Haiku fallback, which isn't built) |

To make a random secret in PowerShell (64 hex characters):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString("x2") })
```

### Database

Migrations are applied **by hand** in the Supabase SQL Editor (the Supabase CLI isn't used):

1. Open Supabase → **SQL Editor** → **New query**.
2. Paste the contents of each file in [`supabase/migrations/`](supabase/migrations/), **oldest first** (the file names start with a timestamp), and click **Run**.
3. Run each file once only.

Auth settings (SPEC §10), under Supabase → Authentication:

- **Email confirmations: off** (Sign In / Providers → Email → "Confirm email").
- **Rate limits: on** (the defaults are fine).

## Running

```powershell
pnpm dev     # dev server at http://localhost:3000
pnpm test    # unit tests (Vitest)
pnpm lint    # ESLint
pnpm build   # production build
pnpm start   # serve the production build locally (after pnpm build)
```

To try it on a phone on the same Wi-Fi, open the **Network** address that `pnpm dev` prints (e.g. `http://192.168.1.20:3000`).

### Country shapes

[`public/geo/countries.geojson`](public/geo/countries.geojson) (the visited-country fill, SPEC §13.3) is made from Natural Earth's 1:50m admin-0 countries (public domain), release v5.1.2. It keeps only `ISO_A2_EH`, is grown 8 km out to sea along the coasts (not across land borders; the map's water hides the excess), and is simplified to about 5 km. To regenerate it, from the repo root (mapshaper runs once through `pnpm dlx`; it isn't a dependency):

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson -OutFile "$env:TEMP\ne_50m_admin_0_countries.geojson"
pnpm dlx mapshaper@0.7.72 -i "$env:TEMP\ne_50m_admin_0_countries.geojson" -filter-fields ISO_A2_EH -buffer 8km topological quad-segs=2 -simplify interval=5000 keep-shapes -o public/geo/countries.geojson precision=0.01
```

## Deployment

Production runs on Vercel (Hobby), connected to this repo: pushes to `main` deploy to production, and pull requests get preview deployments. Set the same variables as `.env.local` (except `ANTHROPIC_API_KEY`) under the Vercel project's Settings → Environment Variables.

### Supabase keep-alive

Free Supabase projects pause after 7 days without activity. [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) calls the production `GET /api/health` every 3 days (`0 12 */3 * *`, 12:00 UTC), which runs a trivial database query. It needs, under the GitHub repo's Settings → Secrets and variables → Actions:

- **Secret** `HEALTH_PING_TOKEN`: the same value as in Vercel.
- **Variable** `SITE_URL`: the production URL, e.g. `https://wanderdex.vercel.app`.

The run fails on anything but HTTP 200. To run it by hand: Actions tab → **Supabase keep-alive** → **Run workflow**.

**GitHub disables scheduled workflows in public repos after 60 days without repository activity** (commits count; the workflow's own runs don't). GitHub emails a warning first. Once it's disabled, Supabase will pause about a week later. To turn it back on: open the repo's **Actions** tab, pick **Supabase keep-alive** in the left list, click **Enable workflow** on the banner, then **Run workflow** once to check that it passes. If the Supabase project has already paused, restore it from the Supabase dashboard first.
