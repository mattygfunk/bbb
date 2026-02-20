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

## Notes
- Existing routes/URLs and core data endpoints were preserved.
- No backend rewrites, payment systems, or complex realtime features added.
