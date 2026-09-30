# CLAUDE.md

**Start of every session: read `docs/SPEC.md` in full.** It is the source of truth. The design reference is `docs/design/design-sheet.png`; where it conflicts with the spec, the spec wins (§16.9).

@AGENTS.md

## Project rules (SPEC §0)
- If something isn't specified, choose the **simplest option that fits the spec** and log it in `docs/DECISIONS.md` (Date | Decision | Reason).
- **Never** add features from SPEC §21 ("Later") or anything else not requested.
- **Ask first** before: changing anything the spec marks as decided, adding a dependency not listed in SPEC §4, or adding a paid service.
- Package manager: **pnpm only** (`pnpm add`, `pnpm dlx`). No npm/yarn lockfiles.
- Commands in docs must work in **PowerShell** (Windows PowerShell 5.1: no `&&`, use `;` or `if ($?) { }`).
- The owner applies migrations by hand in the Supabase SQL Editor. Whenever you create a migration, stop, give the file name, and wait for confirmation that it's applied. Same for any Supabase or Google dashboard setting.
- **No secrets committed.** `.env*` is git-ignored; `.env.example` lists names only. Secret keys stay server-side, never `NEXT_PUBLIC_`.
- Colors come only from the tokens in `src/styles/globals.css`. Fonts: Press Start 2P (headings, buttons) and VT323 (body).
- 8bitcn components: `pnpm dlx shadcn@latest add @8bitcn/<name>`. After adding any shadcn or 8bitcn component:
  - Change its `cn` import to `@/lib/utils` (the configured one knows our custom classes).
  - Replace any lucide icons with Pixelarticons. `lucide-react` must never come back into `package.json`; `pnpm remove` it if the CLI adds it.
  - After any shadcn/8bitcn `add`, run git diff and restore any customized file it overwrote (e.g. ui/button.tsx, styles/retro.css).

## Checks
- `pnpm lint`, `pnpm build`, and `pnpm test` must pass before calling work done.

## Working style
- Think before coding: state assumptions, surface tradeoffs, ask when something is unclear.
- Simplicity first: minimum code that solves the problem, no speculative abstractions or options.
- Surgical changes: touch only what the task needs; match existing style; mention (don't delete) unrelated dead code.
- Clean up only what your change made unused.
- Turn tasks into verifiable goals and loop until they're verified.
