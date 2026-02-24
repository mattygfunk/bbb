# Big Bluff Bay — Content/IA Pass 1

Date: 2026-02-24

## Stack + routing reality
- Static HTML pages served by Express (`server.js`), plus JS frontends.
- Multiple alias routes exist (`/poker`, `/poker-schedule.html`, `/punters`, `/punters.html`, etc.).
- Current bloat source is **intent duplication**, not design.

---

## Canonical route map (recommended)

### Core public
- `/` → Home
- `/poker` → Poker Hub (canonical)
- `/poker-schedule` (or keep `/poker-schedule.html` if preferred) → Schedule
- `/punters` (or `/punters-club`) → Punters Hub
- `/winners` (or `/winners.html`) → Winners snapshot
- `/alerts` → Alerts preferences
- `/wheel` → Wheel page

### Admin
- `/admin/racing` → Racing admin
- `/admin/poker` → Poker admin
- `/admin/wheel` → Wheel admin

---

## Duplication hotspots (file-level)

### 1) Poker entry overlap
- `poker.html`
- `poker-schedule.html`
- `poker-app.html`
- `admin-poker.html` (legacy admin entry)

**Action:** keep `poker.html` as hub + `poker-schedule.html` as schedule; route older/alternate poker landing pages to one of these.

### 2) Punters entry overlap
- `punters.html`
- `punters-club.html`
- `punters-track.html`
- `punters-results.html`

**Action:** one punters hub canonical; keep track/results as child pages only.

### 3) Admin overlap / legacy drift
- `admin.html` (still broad)
- `admin-poker.html` (legacy)
- new `admin-wheel.html`

**Action:** keep split admin nav by domain (racing/poker/wheel), de-emphasize legacy admin surface.

### 4) Content fragmentation in guides
- ~50+ `poker-guide-*.html`

**Action:** keep for SEO but cluster into pillar hubs and reduce excessive crosslinking.

---

## Keep / merge / redirect plan

## KEEP (authoritative pages)
- `index.html`
- `poker.html`
- `poker-schedule.html`
- `punters.html` (or `punters-club.html`, choose one)
- `winners.html`
- `alerts.html`
- `wheel.html`
- `admin.html` (short term), `admin-wheel.html`

## MERGE / DEPRECATE (phase 1 candidates)
- `poker-app.html` → merge into `poker.html` or retire
- `admin-poker.html` → replace with `/admin/poker` route only
- keep only one punters root (`punters.html` OR `punters-club.html`)

## REDIRECT (301)
- alternate poker roots → canonical poker root
- alternate punters roots → canonical punters root
- legacy admin poker entry → `/admin/poker`

---

## Internal linking rules (tight mode)
1. Each page: 1 primary CTA, max 2 secondary CTAs.
2. Avoid linking to multiple pages with same intent.
3. From guides: link up to `poker-guides.html` + 2 relevant siblings max.
4. Footer stays broad, body links stay intent-specific.

---

## Quick implementation shortlist (next pass)
1. Add canonical tags consistently on all high-traffic pages.
2. Add explicit redirect table in `server.js` for duplicate intents.
3. Add "content clusters" section to `poker-guides.html` and reduce flat list weight.
4. Remove/redirect `admin-poker.html` legacy entry.
5. Normalize nav labels/targets across Home, Poker, Punters, Wheel.

---

## IA guardrails (keep future changes tight)
- One canonical URL per user intent. New pages must declare canonical target.
- If adding a page that overlaps an existing intent, add redirect/deprecation plan in same PR.
- Keep top-level nav to core intents only; route niche actions into subpages.
- Destructive admin actions belong in `/admin/advanced`, not primary admin surfaces.
- New guide pages must map to a content cluster (Bankroll / Tournament Strategy / Mental Game / Process).
- Every PR touching navigation should update this doc if route intent changes.

## Notes
- This pass intentionally avoids visual changes.
- Goal is cleaner user intent paths + tighter crawl structure + less maintenance overhead.
