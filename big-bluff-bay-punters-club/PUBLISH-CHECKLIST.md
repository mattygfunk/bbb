# Big Bluff Bay — Publish Checklist

## Content & UX
- [ ] Confirm all schedule times are correct (AEST/AEDT handling)
- [ ] Confirm current promo claims are accurate (e.g. holiday package wording)
- [ ] Update any time-sensitive winner references (e.g. Sylvia) if needed
- [ ] Check all CTA buttons route to the intended page/section
- [ ] Review mobile layout for FAQ columns and tables

## SEO
- [ ] Run through page titles/descriptions for final wording
- [ ] Confirm canonical URL exists on every major page
- [ ] Confirm FAQ JSON-LD validates (Poker FAQ + Punters FAQ)
- [ ] Confirm Breadcrumb/Article JSON-LD validates on guide/rules pages
- [ ] Re-submit updated `sitemap.xml` in Google Search Console

## Links & Navigation
- [ ] Spot-check nav/footer links on Home, Punters, Poker, FAQ pages
- [ ] Verify Related Pages blocks do not self-loop excessively
- [ ] Ensure no broken links to `/poker-faq.html`, `/punters-faq.html`, `/winners.html`

## Data & Functional
- [ ] Validate `/api/milestones` response on production
- [ ] Verify Winners Hub loads featured winner/history/streaks
- [ ] Verify punters milestone tables render with empty-state gracefully
- [ ] Verify share buttons still work after latest updates

## Performance
- [ ] Hard refresh test to verify cache-busted assets load latest JS
- [ ] Run Lighthouse pass (Home, Punters, Poker, Poker FAQ)
- [ ] Compress any new large images before major campaigns

## Compliance & Safety
- [ ] Ensure promo terms match actual event conditions
- [ ] Confirm Terms/Privacy links are visible on key entry pages
- [ ] Remove/adjust any claims that could be interpreted as guaranteed winnings

## Launch
- [ ] Deploy latest commit
- [ ] Smoke-test top pages in prod
- [ ] Share updated URLs in social posts
- [ ] Monitor analytics and top entry pages for 48 hours
