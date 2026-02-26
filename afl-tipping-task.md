# AFL Tipping Full Integration — BBB

## Your Job
Fully integrate AFL Footy Tipping into BigBluffBay.au as described below. Work in the repo at:
`/Users/matthewsimon/.openclaw/workspace/big-bluff-bay-punters-club/`

## Step 1: Read These Files First (ALL of them)
- server.js (4910 lines) — understand ALL routes, auth patterns, store structure
- afl-tipping-system.js — existing AFL backend logic
- afl-tipping.html — existing hub page
- afl-tipping-submit.html + afl-tipping-submit.js — existing submit page
- afl-tipping-leaderboard.html + afl-tipping-leaderboard.js
- afl-tipping-results.html + afl-tipping-results.js
- admin-afl-tipping.html + admin-afl-tipping.js
- index.html — homepage
- punters.html — mirror this pattern for AFL homepage block
- punters.js — understand punters club JS patterns
- styles.css — understand ALL CSS variables and patterns
- menu-auth.js — understand auth pattern
- data/store.json — understand data structure (first 200 lines at least)
- winners.html + winners.js — understand winners pattern

## Step 2: Understand What Already Exists
Map out: what AFL routes/APIs already exist in server.js, what data models exist in store.json, what pages exist.

## Step 3: Build Everything Missing

### A) CSS FIX (already done by prior agent, verify)
`afl-tipping-submit.html` and `afl-tipping-leaderboard.html` should have `/styles.css` (absolute path). Check & confirm.

### B) New Pages to Create
1. `afl-tipping-rules.html` — Rules + payment info + tie rules + prize structure  
   - $75 cash entry (BSB transfer)
   - Weekly jackpot $30 (rolls over if tied)
   - Season prizes: top 3, transparent split based on entrants × $75
   - Scoring: 1pt per correct tip, per-game lockouts
   - Tie-breaker rules (total correct tips, then... define clearly)
   - FAQ section
   
2. `afl-tipping-winners.html` — Weekly winners + season milestones
   - List weekly winners by round
   - Mark rollover weeks
   - Show payout status
   - Season milestone highlights

### C) Backend: server.js additions
Read the existing AFL routes carefully, then ADD what's missing:

**New API endpoints needed:**
- `GET /api/afl/summary` — homepage block data: entrant count, jackpot, next lockout, top 10, last winner, hot streak, rollover state. Cache-friendly (cache 60s).
- `GET /api/afl/rules` — prize pool calcs based on paid entrant count
- `GET /api/afl/winners` — weekly winners history with rollover flags
- `POST /api/afl/alerts/subscribe` — opt-in to AFL alerts (email + onsite)
- Alerts: integrate AFL into existing alerts system — "round opens", "24h lockout warning", "tips not submitted", "jackpot won/rolled"

**Data model additions** (in store.json structure):
- `afl.jackpotLedger`: array of {round, amount, status: 'won'|'rolled', winner?, settledAt?}
- `afl.entries[userId].alertsOptIn`: bool
- `afl.banterMessages`: array of {userId, handle, message, ts}
- Ensure `afl.seasons[seasonId].rounds[roundId].result` captures weekly winner, correct count, jackpot state

### D) Homepage (index.html)
Add an "AFL Tipping Live" block. Mirror the Punters Club live module style.

Find where the Punters Club live block is in index.html, add AFL block nearby (above or alongside).

Block content:
```html
<section id="afl-live-block" class="card" style="...">
  <div>🏉 AFL Tipping — 2026 Season</div>
  <div id="afl-entrants">... entrants</div>
  <div id="afl-jackpot">Weekly Jackpot: $...</div>
  <div id="afl-next-lockout">Next lockout: ...</div>
  <div id="afl-top10">Top 10 table</div>
  <div id="afl-highlights">Leader / hot streak / last winner</div>
  <div id="afl-banter-teaser">banter teaser</div>
  <div>CTA buttons: Submit Tips | View Ladder</div>
</section>
```
Load data via `fetch('/api/afl/summary')` in a new `afl-home.js`.

### E) afl-tipping.html hub page
Ensure it has:
- Sub-nav: Hub | Submit | Leaderboard | Results | Rules | Winners
- Jackpot trajectory (last 6 rounds won/rolled)
- Live projected prize pool (1st/2nd/3rd) based on paid entrant count
- "Quick Enter" CTA with BSB transfer details
- Season leader highlight
- Round banter section (last 2–3 messages, "Log in to banter")

### F) afl-tipping-submit.html / afl-tipping-submit.js
Add:
- "Quick pick all favourites" button (picks home team or highest-ranked for each unlocked game)
- Margin tip input (optional, single number, tie-breaker for the "banker" game)
- Better lock state UI

### G) Admin: admin-afl-tipping.html + admin-afl-tipping.js
Ensure it has:
- Entrants list: pending/approved/rejected, manual approve button + note field
- Fixture management: add/edit rounds and matches with kickoff times (AEST)
- Results settlement: input results per game, auto-compute round scores, lock snapshot
- Jackpot control: confirm winner or mark rollover, enter payout status
- Announcements: edit text shown on hub + homepage
- Export CSV: entrants, season ladder, weekly winners, payout ledger
- AFL alerts management: trigger "round open", "24h warning", "results published" notifications

### H) Navigation
In ALL afl-tipping pages (hub, submit, leaderboard, results, rules, winners), add a consistent AFL sub-nav:
```
🏉 Hub | ✏️ Submit Tips | 🏆 Leaderboard | 📊 Results | 📋 Rules | 🥇 Winners
```

Also check `menu-auth.js` — the AFL Tipping nav link should be consistent.

### I) Footer
In index.html footer "Navigate" section, ensure AFL Tipping links are present:
- AFL Tipping Hub
- Submit Tips  
- Leaderboard
- Rules

### J) afl-tipping-results.html / afl-tipping-results.js
Ensure per-round results show:
- All fixtures with final scores
- Per-user correct tip count for that round
- Weekly winner (or "Jackpot Rolled" if tied)
- Jackpot amount for that round
- Link to view full round ladder snapshot

### K) Alerts integration
In `alerts.html` and `alerts.js` — add AFL alert types to the subscription options.

## Style Rules
- Match existing BBB dark theme exactly
- Use existing CSS variables: `--brand`, `--afl-light`, `--surface`, `--line`, `--muted`, `--text`
- AFL accent: `#93c5fd` (afl-light), `#0c1d3a` (afl-dark)
- All new pages use `/styles.css` (absolute path) — NO relative paths
- Mobile-first responsive
- Cards use `.card` class
- Buttons use `.btn .btn-primary` or `.btn .btn-ghost`

## Version String
Use `v=20260226-2` on all asset URLs when you touch a file.

## What to Report When Done
List every file created or modified with a one-line summary of changes.
