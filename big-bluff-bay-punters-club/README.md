# Big Bluff Bay Punters Club

## Poker Analytics / Leaderboards V2

This project now includes a dedicated Poker Analytics system with canonical player identity, admin bulk imports, seasons, events, leaderboards, and audit logs.

### New public routes
- `/poker`
- `/poker/leaderboards`
- `/poker/events`
- `/poker/events/:id`
- `/poker/players`
- `/poker/players/:id`

### New admin routes
- `/admin/poker`
- `/admin/poker/results`
- `/admin/poker/events`
- `/admin/poker/players`

### Admin import flow
1. Login as admin.
2. Open `/admin/poker/results`.
3. Paste raw lines in Smart Paste format, preview, then save.
4. Optional: attach screenshot reference string for trust/audit.
5. CSV import supported (`player,points,event`).

### Seasons usage
- View seasons in `/admin/poker`.
- Set one season active (used by season leaderboard filters).
- New seasons are created via API `POST /api/poker/seasons`.

### Data notes
- Existing `pokerResults` + `pokerPlayers` are migrated into `store.pokerV2` automatically.
- Points stored as DECIMAL-like strings rounded to 1 decimal (`"123.4"`) to avoid float drift.
- Canonical name: trim + collapse spaces + lowercase.
- Aliases are tracked for dedupe and imports.

### Development
```bash
npm install
npm test
npm start
```

### Test coverage
- Integration test: `test-v4.js`
- Poker V2 unit safeguards: `test-poker-v2.js`
