# DocuHop

A free, unofficial planner for IDFA 2026, the International Documentary Film Festival Amsterdam (Thu 12 to Sun 22 Nov).
Every public showing on one map, day by day; your shot list with walking and ferry times, clashes and leave-by times;
a group ticket board (who has a ticket, who wants one) and a "when is everyone free" grid. Built on the MuseumHop
engine, with all of its functions. Not affiliated with IDFA. DocuHop never sells tickets: people buy on IDFA's site.

## Ground rules (low-risk launch)
DocuHop launches without asking IDFA first, so it keeps to what is plainly lawful and easy to stop:
- **Facts only from IDFA:** title, start, end, venue/hall, length, the English-subtitles flag (plus DocLab and
  walk-in flags). No ticket status or availability, no descriptions, stills or logo. `npm run programme` refuses a
  snapshot that still carries ticket data.
- **Gentle refreshes:** the programme is re-read at most once or twice a day, about 2.5 minutes of ordinary page
  loads (see below). Nothing polls IDFA, and visitors' browsers only reach IDFA when they open one of its links.
- **Links, not copies:** every film links to its official IDFA page ("Tickets on IDFA ↗").
- **Every page says:** "Unofficial fan planner, not affiliated with IDFA. Times can change: always check the official
  page.", names idfa.nl as the source of the times (with a link) and shows the contact address
  (`SiteNote` in `src/components/help.tsx`).
- **Pause within minutes** if IDFA objects: `scripts/pause.sh on` (below).

## Stack
- Vite + React + TypeScript, Leaflet on PDOK tiles (made dark with a CSS filter), lucide icons.
- Supabase (shared **to-one** project, tables prefixed `dh_`): anonymous sign-in tagged `app=docuhop`, Row Level
  Security per group, Realtime for live updates. Schema: `supabase/migrations/20261109200000_docuhop.sql`.
- Programme: `data-raw/idfa-*.json` (facts only, read from IDFA's public programme) → `npm run programme` →
  `src/data/programme.json`. Venues and coordinates: `src/data/venues.json`.
- Travel times between venues: `src/data/walk.json` and `bike.json`, built once with `npm run walk-matrix` (OSRM, plus
  a ferry wait across the IJ).

## How it holds together
- Times are minutes after Thu 12 Nov 00:00 (Amsterdam), so all 11 days sit on one scale (`src/lib/catalogue.ts`).
  `src/lib/plan.ts` works out legs between cinemas, clashes, leave-by times and other showings that fit.
- A **group** (a "night" in the database) is reached only through its invite link (`#night=<token>`; the database
  stores a hash). Shot lists are routes: the group's, your own, and one per crew, one row per showing.
- The ticket board (`dh_tickets`) and free days (`dh_free`) are the group's own data: each member ticks their own row.
- `src/lib/sync.ts` applies every change on screen at once, saves in order, queues offline and patches from Realtime.
  Undo replays the inverse change.
- Update permissions are per column, so nobody can promote themselves or move rows between groups or showings.

## Run
```bash
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:5192
npm run check-access         # 30 checks against the real database; then run scripts/cleanup-access-check.sql
```

## Refresh the programme (at most once or twice a day)
1. Open https://festival.idfa.nl/en/collectie/ in a browser and let it load.
2. Run `scripts/capture-programme.js` in that page (console, or a browser tool's "run JavaScript"). It lets the page
   load the 11 days, 3 views each, 3–4 seconds apart, keeps facts only and leaves the JSON in `window.__export`
   (`window.__chunk(0)`, `(1)`, … give it in 20 KB pieces). It never calls IDFA's API directly.
3. Save it as `data-raw/idfa-YYYY-MM-DD.json`, run `npm run programme` and read the change report (new, gone, moved).
   Saved plans point at show ids, so a "gone" showing drops out of people's lists: check those by hand.
4. Commit and push to `main`; the deploy publishes it. The "last checked" time on every page comes from the snapshot.

## Pause (if IDFA objects)
```bash
scripts/pause.sh on "DocuHop is offline for now."   # notice page replaces the site, live in about a minute
scripts/pause.sh status                              # paused here? paused on GitHub?
scripts/pause.sh off                                 # bring the planner back (about 2 minutes)
scripts/pause.sh preview                             # build the notice into dist-pause/ to look at
```
`on` commits a `PAUSED` file (holding the message) to `main` and pushes. The deploy workflow then publishes only
`pause/index.html` (as `index.html` and `404.html`, so every link lands on it) and skips the app build. Browsers that had
the site open may show a cached copy for up to 10 minutes. The database is untouched: groups stay until the automatic
deletion on 23 Dec 2026. To remove them sooner, delete the `dh_` groups (ask first: the project is shared).

## Deploy
GitHub Pages through Actions (`.github/workflows/deploy.yml`) from `main`, with repository variables `VITE_SUPABASE_URL`
and `VITE_SUPABASE_PUBLISHABLE_KEY`; Pages source "GitHub Actions"; custom domain `docuhop.arian-shafa.xyz`
(`public/CNAME`, plus a CNAME record `docuhop` → `weareaiforfun-hub.github.io`). Add "GitHub Pages hosts the site" to the
Your data page when it goes live.

A project by [Arian Shafa](https://arian-shafa.xyz).
