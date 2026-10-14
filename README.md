# Big Bluff Bay — Australian poker events

A clean starting point for turning Big Bluff Bay into a useful Australian poker-event finder, with a small, plain-English hand decision feature.

## Run locally

Serve this folder from a local web server so `data/events.json` can be loaded:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Update the calendar

Edit `data/events.json`. Each event needs a title, organiser, event type, city, state, venue, start and end dates, the date it was checked, and a link to the organiser’s own page. The homepage filters expired events automatically using the `Australia/Melbourne` calendar date.

Keep listings factual, link to primary organiser sources, and recheck details before publishing. Do not add private games or real-money online poker promotions without a legal review of the listing and promotion rules.

## Calendar source monitoring

GitHub Actions runs a small source check daily and can also be started from **Actions → Poker calendar source monitor → Run workflow**. It validates event fields and dates, flags upcoming listings that have not been rechecked recently, checks organiser links, and looks for upcoming events published as Schema.org `Event` data on those organiser pages. Findings appear in one maintained GitHub issue. Structured-data matches are suggestions only: a person must verify game details, dates, venue and host before they are added to the public calendar. The monitor does not publish new event records automatically.

The daily job checks the trusted organiser source list in `data/sources.json`, including sources with no currently active listing, then rebuilds event details, organiser and venue profiles, city pages, feeds and the sitemap. When matching Schema.org data is published, it looks for date, venue, organiser, cancelled/postponed status, clearly labelled entry-price and advertised-guarantee changes. Differences become review alerts; the calendar is not silently rewritten. Coverage depends on what each organiser exposes in structured data, so the official pages still need human review. It commits generated pages only when they change. It runs on its daily schedule or when manually started; it does not run on every push or pull request. City hubs for the Gold Coast and Cairns are included; sparse city pages and event pages with an unconfirmed venue are kept out of search indexing. The automation keeps the last published event data intact when a source is blocked or unavailable. New events remain review suggestions and are never published automatically.

## Current homepage features

- Mobile-first layout with city, date, event type, entry budget, guaranteed prize pool and verified game-format filters
- Shareable search URLs that preserve selected filters
- Upcoming event cards with source, last-checked, entry/guarantee facts, and map links only when venue details are confirmed
- A dedicated page for each upcoming event, with official links, calendar download, share action, and verified event details
- Generated organiser profiles and event venue pages with cross-links between listings
- Popular-city shortcuts
- Saved events stored privately in the visitor’s browser
- Shareable search filters that can be reopened from a link
- One-click all-day calendar downloads in `.ics` format
- An interactive beginner-friendly decision prompt
- Tournament, organiser, venue and priority-city directory pages rebuilt from the verified event data
- RSS (`events.xml`) and subscribable iCalendar (`events.ics`) feeds
- Daily change review alerts when official structured schedule data disagrees with a listing
- Unique titles, meta descriptions, canonical URLs, Open Graph/Twitter social previews, breadcrumbs, and factual Schema.org structured data
- A sitemap that includes indexable event/profile pages only; thin search results and sparse city pages are excluded
- A full-text search page linked from the main navigation
- Branded 404 and 403 pages with search and clear routes back into the site
- No visitor accounts, payments, or location permissions

The seeded events were checked against organiser sources on 14 October 2026. Organisers control final schedules; visitors should verify details directly before travelling or registering.

## Error pages and search

Cloudflare Pages serves the root `404.html` automatically for missing pages. `/search.html` searches the upcoming event calendar and is marked `noindex` so individual search terms do not become thin search-engine pages.

`403.html` is the branded page to use for Cloudflare WAF or IP block errors. Cloudflare does not automatically serve a repository's `403.html` for those security blocks. To show it for WAF blocks, configure the zone's **Error Pages → WAF block** custom page to use `https://bigbluffbay.au/403.html`. Cloudflare's Custom Error Pages are available on paid plans; on Free, the file remains available as a normal page but cannot replace the built-in WAF block page.

## Search result measurement

Page titles and descriptions are written to make event, city and organiser intent clear, and social preview cards are generated for sharing. Google chooses the final title and snippet and may rewrite either one. Structured data and sitemap inclusion do not guarantee a rich result or a ranking. After deployment, verify the site in Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, and use Search Console's Performance report to compare impressions, clicks and click-through rate by query and page. Change one title or description at a time after enough impressions accrue, and keep any edited facts aligned with the official organiser source. No analytics or advertising trackers are installed on the site.

## Deploy to Cloudflare Pages

This is a buildless static site. Connect the GitHub repository in Cloudflare Pages, select the `bbb` production branch, leave the build command empty, and set the build output directory to `/`. The homepage and assets live at the repository root.

Add `bigbluffbay.au` as a custom domain in Cloudflare Pages after the domain is on Cloudflare DNS. Keep the existing live host in place until Cloudflare verifies the domain and the new deployment is working.
