# Changelog — 2026-02-20

## Homepage (`index.html`, `landing.js`, `styles.css`)
- Refined above-the-fold hero copy to premium, minimal framing:
  - H1 now: **“Big Bluff Bay — Punters Club → Poker Nights”**
  - Subheading now: **“Tip fast. Lock in. Win real. Verified results. Transparent payouts.”**
- Kept conversion CTAs prominent and mobile-first:
  - Enter Punters Club
  - See Winners
  - How it Works
  - View Full Card
- Added clearer premium trust flow:
  - Updated **How it works** to a 4-step row: **Tip → Lock → Ladder → Poker**
- Extended **Proof of performance** section:
  - Added accessible “Recent verified results (Punters Club + Poker)” table (`#recent-results-body`)
  - Added teaser links to payout history and streaks on Winners page
  - Wired homepage data hydration to populate this new table from existing combined winners feed
- Updated **Rules at a glance** accordion content for concise rule clarity:
  - Edits until lock
  - One entry flow
  - Transparent scoring updates
  - Bosses Multi freeroll eligibility

## Accessibility improvements
- Added `aria-label` attributes to primary icon-style nav links on Home and Winners pages.
- Added table captions and `scope="col"` for key tables:
  - Home ladder table
  - Home recent verified results table
  - Winners analytics/results/history/streak tables
- Kept visible focus-ring system and keyboard-safe interactions intact.

## Design tokens + UI polish (`styles.css`)
- Expanded shared tokens for consistency:
  - Radius tokens (`--radius-sm`, `--radius-md`, `--radius-lg`)
  - Soft shadow token (`--shadow-soft`)
- Tightened button behavior consistency:
  - Added interaction transitions and active press state
  - Added hover treatment for ghost buttons
- Added small layout helpers:
  - `how-it-works` responsive 4-card grid tuning
  - winners preview table wrapper styling
  - global table caption styling for readability

## SEO/share metadata (`winners.html`)
- Upgraded Winners page metadata:
  - robots meta
  - Open Graph tags (title/description/url/image)
  - Twitter card tags
- Updated Winners page meta description to emphasize verified outcomes and trust.

## Performance/Lighthouse sweep (follow-up)
- Reduced avoidable layout shifts in hero/live modules by reserving space for dynamic status and next-tip fields.
- Added fixed dimensions for footer social logos to avoid icon reflow.
- Switched below-fold club banner image to `loading="lazy"` + `fetchpriority="low"`.
- Added stable space reservation for homepage winners/result modules.

### Lighthouse snapshot (localhost, headless)
- **Mobile:** Performance **91**, Accessibility **95**, Best Practices **100**, SEO **100**
- **Desktop:** Performance **88**, Accessibility **95**, Best Practices **100**, SEO **100**

## Bosses Multi v2 (Punters + Admin)
- Rebuilt Punters page Bosses Bet block into a premium **Bosses Multi Tracker v2** module:
  - clear concept copy tied to Poker Freeroll
  - status badge (LIVE/WON/LOST/VOID)
  - metadata cards: week/round, meet, stake, potential return, freeroll amount, lock, last updated (Melbourne time)
  - leg-by-leg table (Leg #, Race, Selection, Type, Odds, Result)
  - editable eligibility note rendering
- Updated Punters rules copy to dynamic amount:
  - “If the Bosses Multi lands, eligible players score a next-day Poker Freeroll worth **$X**.”
  - uses admin-set freeroll prize; falls back to TBA.

- Added Admin **Bosses Multi** editor section:
  - fields: title, week/round key, meet, status, freeroll prize amount, eligibility note, optional stake/return/lock time
  - repeater legs editor with add/remove rows and fields for race/selection/type/odds/result
  - quick actions: Mark as Won / Mark as Lost
  - save/update persists and reflects on punters view.

- Extended Bosses Multi data model + endpoint plumbing (no new dependencies):
  - `trackData.bossesBet` now supports metadata fields (`title`, `weekKey`, `meet`, `status`, `freerollPrize`, `eligibilityNote`, `lockTime`, `stake`, `potentialReturn`, `legItems`)
  - backward-compatible read/render path still supports existing `legs + selections` structures.

## Notes
- Existing routes/URLs and core data endpoints were preserved.
- No backend rewrites, payment systems, or complex realtime features added.

## Bosses Multi v2.1 polish
- Added stronger status color chips on Punters Bosses module (LIVE/WON/LOST/VOID).
- Tightened mobile presentation for Bosses summary + leg table scrolling/spacing.
- Added lightweight admin toast-style feedback animation and tone coloring for Bosses actions (save/autofill/reset/errors).

## Admin screenshot extraction + double verification
- Added Admin upload workflow for betting screenshots in Bosses Multi panel:
  - upload image (jpg/png/webp)
  - run extraction
  - review parsed draft
  - one-click fill into Bosses form
  - explicit save remains manual
- Added backend endpoint: `POST /api/admin/extract-bosses-multi` (admin-only).
  - accepts multipart upload (and JSON data URL fallback)
  - executes two independent OpenAI vision extraction passes
  - normalizes strict JSON contract
  - computes pass diffs and merged draft with conflict nulling
- Added draft review UI in Admin:
  - parsed summary + legs table
  - verified/needs-review badge
  - differences list
  - actions: Fill Form, Copy JSON, Discard Draft
- Auto-track leg status on Punters Bosses tracker:
  - when race results are entered, each Bosses leg now resolves to Pending/Won/Lost automatically by race + selection
  - preserves extracted odds from admin-uploaded bet slip and displays them in the public tracker
- Updated defaults + display format per admin workflow:
  - new Bosses legs default to **PLACE** bet type before/after extraction flows
  - merged public tracker columns from separate `Leg #` + `Race` into one `Leg / Race` column (e.g., `Leg 1 · R1`)
- Bosses Multi overhaul assumptions now enforced in app logic:
  - all Bosses Multi legs are stored/rendered as **PLACE** bets
  - Bosses meet/track is auto-synced to the current tipping track fixture (admin meet field is read-only)
  - public tracker simplified to Leg/Race + Selection + Odds + Result for faster scan
  - lock time now auto-falls back to the known global tip edit lock deadline when not manually set
  - stake is fixed at **$25** across admin + public tracker

## Punters promo overhaul (below-the-fold)
- Replaced the flat/terminal-like lower section with a premium promo composition:
  - new structured `punters-promo` wrapper with felt gradient and card surfaces
  - section header + 2x2 feature card grid with badge-style icon chips
  - upgraded FREE vs Jackpot Eligible block to comparison-offer layout with Recommended badge
  - CTA row restored inside promo wrapper: Enter Punters Club / See Winners
- Added PCH-inspired conversion modules:
  - **Take a Tour** strip: Tip Once → Lock Hits → Ladder Updates → Jackpot/Winners
  - **Stats Preview** teaser card wired from existing milestones/winners data
  - **Banter Wall** comms teaser with lightweight “Share your tip” action
- Upgraded Bosses Multi area into spotlight-style presentation while keeping live data wiring intact.
- Added password recovery flow on Punters login gate:
  - registration supports optional recovery code
  - forgot-password form resets via username + recovery code + new password
  - backend endpoints added for reset and authenticated recovery-code set (`/api/password-recovery/reset`, `/api/password-recovery/set`)
- Preserved accessibility and performance posture:
  - semantic headings/lists
  - mobile-first stacking and tap targets
  - subtle effects with reduced-motion fallback

## Logged-in cockpit UX on Punters page
- Added **Your Round Snapshot** card under “Your Next Race Tip” (logged-in only):
  - rank, points, gap to 1st, remaining races
  - jackpot status chip + bosses multi eligibility chip
  - submitted-at and round/meeting meta line when available
- Added **What You Need to Win** scenario panel (logged-in only):
  - rule-based scenario generator from ladder position, gap, remaining races, next pick, and ladder clustering
  - short, probability-safe guidance lines (no deterministic win claims)
- Data/fallback behavior:
  - reuses existing overview/ladder/tips data already loaded on page
  - missing fields render as `—` and generic scenario fallback instead of hiding/crashing

## Poker Schedule lobby overhaul
- Rebuilt `poker-schedule.html` into a premium lobby layout with:
  - hero + Next Event widget + live countdown status
  - dynamic event cards (Sunday Main / Nightly Prime / Late Night GTD)
  - cards/week toggle generated from one centralized config object
  - pathway block + session picker + results/promo proof section
- Added client-side `poker-schedule.js` dynamic features:
  - Melbourne-time next-event calculation
  - per-event .ics download + Google Calendar links
  - timezone mode toggle (Melbourne/local)
  - lightweight session recommendation logic
- Added poker lobby styling in `styles.css` with mobile-first card/grid behavior and accessible focus-preserving controls.

## 5-star uplift batch: how-poker-works + 10 low-scoring pages
- Upgraded `how-poker-works.html` with dynamic “What’s Next at Big Bluff Bay” lobby strip (live status + countdown + Melbourne/local time) and corrected enhanced footer.
- Added shared dynamic strip script: `poker-dynamic-strip.js` (frontend-only, no backend dependency).
- Applied the same premium dynamic strip + footer standardization to 10 additional low-scoring pages:
  - `melbourne-poker-options.html`
  - `sydney-poker-options.html`
  - `brisbane-poker-options.html`
  - `perth-poker-options.html`
  - `adelaide-poker-options.html`
  - `australia-poker-options.html`
  - `poker-rules.html`
  - `poker-guides.html`
  - `poker-faq.html`
  - `how-punters-works.html`
- Result: stronger “what’s next” UX, consistent premium footer/legal/social block, and live countdown context across key evergreen pages.

## Poker join conversion flow
- Updated `/poker-schedule.html` primary join CTA to route to new `/join.html` conversion page.
- Added dynamic trust/urgency chips on schedule page:
  - invites open/paused
  - setup time estimate
  - next game countdown
- Added new `/join.html` with:
  - live invite status row + next-event countdown widget
  - 4-step join checklist cards
  - copy utilities (club ID, join message, support intro)
  - localStorage progress checklist + reset
  - friction-reduction FAQ + CTA footer band
- Added shared config/helpers module: `bbb-shared.js`.
  - Edit invite + join settings in `JOIN_CONFIG` (invitesOpen, approvalTimeMinutes, setupEstimateMinutes, clubId, joinMessageTemplate)
  - Edit event schedule/settings in `SCHEDULE_CONFIG`.

## Admin Paste Runners Importer + Punters race runner integration
- Added Admin **Paste Runners Import** section (`admin.html` + `admin.js`):
  - race selector (`Import into Race #`), source/notes, paste textarea
  - Parse / Save to Race / Clear actions
  - parsed preview table with SCR + warnings + confidence
  - overwrite protection prompt when selected race already has imported runners
- Added tolerant parser backend (`server.js`):
  - `POST /api/race-runners/parse` (regex + fallback block parsing)
  - `PUT /api/race-runners/:race` save endpoint with overwrite flag
  - `GET /api/race-runners` admin retrieval
- Storage model:
  - centralized under `trackData.raceRunners` (and mirrored `store.raceRunners` for thoroughbreds compatibility)
  - shape: `raceRunners.RX = { importedAt, importedBy, source, notes, runners[] }`
- Punters page integration (`punters.js`):
  - uses `overview.raceRunners` when present to build race selection options
  - displays imported runner names/barriers/place odds in dropdown labels
  - SCR runners are flagged and disabled in selection options
  - falls back to numeric 1–24 list when no import exists
- Security/robustness:
  - requires admin auth
  - 10MB upload cap
  - no persistent screenshot storage
  - helpful errors when extraction/env key unavailable
