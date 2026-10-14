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

## Current homepage features

- Mobile-first layout with city, date, and event-type filters
- Upcoming event cards with source and last-checked details
- Popular-city shortcuts
- Saved events stored privately in the visitor’s browser
- Shareable search filters that can be reopened from a link
- One-click all-day calendar downloads in `.ics` format
- An interactive beginner-friendly decision prompt
- A full-text search page linked from the main navigation
- Branded 404 and 403 pages with search and clear routes back into the site
- No visitor accounts, payments, or location permissions

The seeded events were checked against organiser sources on 14 October 2026. Organisers control final schedules; visitors should verify details directly before travelling or registering.

## Error pages and search

Cloudflare Pages serves the root `404.html` automatically for missing pages. `/search.html` searches the upcoming event calendar and is marked `noindex` so individual search terms do not become thin search-engine pages.

`403.html` is the branded page to use for Cloudflare WAF or IP block errors. Cloudflare does not automatically serve a repository's `403.html` for those security blocks. To show it for WAF blocks, configure the zone's **Error Pages → WAF block** custom page to use `https://bigbluffbay.au/403.html`. Cloudflare's Custom Error Pages are available on paid plans; on Free, the file remains available as a normal page but cannot replace the built-in WAF block page.

## Deploy to Cloudflare Pages

This is a buildless static site. Connect the GitHub repository in Cloudflare Pages, select the `bbb` production branch, leave the build command empty, and set the build output directory to `/`. The homepage and assets live at the repository root.

Add `bigbluffbay.au` as a custom domain in Cloudflare Pages after the domain is on Cloudflare DNS. Keep the existing live host in place until Cloudflare verifies the domain and the new deployment is working.
