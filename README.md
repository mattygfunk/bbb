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
- An interactive beginner-friendly decision prompt
- No visitor accounts, payments, or location permissions

The seeded events were checked against organiser sources on 14 October 2026. Organisers control final schedules; visitors should verify details directly before travelling or registering.

## Deploy to Cloudflare Pages

This is a buildless static site. Connect the GitHub repository in Cloudflare Pages, select the `bbb` production branch, leave the build command empty, and set the build output directory to `/`. The homepage and assets live at the repository root.

Add `biglifebuy.au` as a custom domain in Cloudflare Pages after the domain is on Cloudflare DNS. Keep the existing live host in place until Cloudflare verifies the domain and the new deployment is working.
