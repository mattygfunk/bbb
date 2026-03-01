# Site-Wide Problem Report

Scan performed: 2026-03-01
Scope: All server-side (server.js, poker-system.js, afl-tipping-system.js) and client-side JS/HTML files.

---

## CRITICAL

### 1. Hardcoded JWT Secret Fallback
**File:** `server.js:13`
**Code:**
```js
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
```
If the `JWT_SECRET` environment variable is not set, the application signs all tokens with the publicly-known string `dev-only-change-me`. An attacker can forge a valid JWT for any user—including with `role: "admin"`—without needing credentials.
**Fix:** Remove the fallback. Throw a startup error if the env var is missing.

---

### 2. Hardcoded Default Admin Password + Migration Resets Passwords to "admin123"
**File:** `server.js:76, 106`
**Code:**
```js
const adminHash = bcrypt.hashSync('admin123', 10);
// ...
// Migration: any user with an old-format hash gets their password reset to 'admin123'
user.passwordHash = bcrypt.hashSync('admin123', 10);
```
Two separate problems:
- The seeded admin account always starts with password `admin123`.
- A startup migration silently resets **any** user whose `passwordHash` matches the old scrypt format back to `admin123`, overwriting their actual password.
**Fix:** Remove the hardcoded password from the migration. Require the admin to set a password on first login instead of silently setting it to a known value.

---

### 3. Variable `round` Used Before Declaration — ReferenceError Crash
**File:** `server.js:4026, 4039`
**Code:**
```js
// Line 4026 — 'round' is not yet declared
const roundOpenedAt = Number(round?.createdAt || 0);
// ...
// Line 4039 — 'round' is declared here
const round = getCurrentRound(store, { autoCreate: false, trackId });
```
The `DELETE /api/punters/member` (admin) endpoint references `round` 13 lines before it is declared with `const`. In strict-mode JS this throws `ReferenceError: Cannot access 'round' before initialization`, crashing the request handler. The `roundOpenedAt` guard that restricts tip removal to the current round is therefore never applied, causing unintended data mutation if the error is somehow caught upstream.
**Fix:** Move the `const round = …` declaration above the `roundOpenedAt` line.

---

## HIGH

### 4. Content Security Policy Disabled
**File:** `server.js:1713`
**Code:**
```js
app.use(helmet({ contentSecurityPolicy: false }));
```
CSP is the primary defence against XSS. Disabling it means any injected script executes without restriction.
**Fix:** Enable helmet's default CSP and tune as needed rather than disabling entirely.

---

### 5. Public Profile-Summary Endpoint Leaks Private User Data (IDOR)
**File:** `server.js:4413`
**Code:**
```js
app.get('/api/profile-summary/:member', (req, res) => {   // no auth middleware
    // returns profile, punters breakdown, poker results for any username
```
This unauthenticated endpoint returns the full profile object (including `bio`, `email` if stored, profile picture) plus complete punters and poker history for any username. Users whose `publicProfile` setting is `false` (the default) still have their data fully exposed via this endpoint.
**Fix:** Add the `auth` middleware, or at minimum check `user.profile.settings.publicProfile` and filter accordingly before returning data.

---

### 6. Weak Password Minimum — 6 Characters
**File:** `server.js:1831, 1918, 1965, 1987`
**Code:**
```js
if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
}
```
Six characters is far below current recommendations (NIST SP 800-63B: minimum 8, prefer 15+). Combined with the permissive rate limit (see below), brute-force attacks on short passwords are feasible.
**Fix:** Raise the minimum to at least 8 characters (12 preferred).

---

### 7. Global Rate Limit Too Permissive — 200 Requests/Minute
**File:** `server.js:1742`
**Code:**
```js
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }));
```
200 requests per minute is the only rate limit applied site-wide. There is no stricter per-route limit on `/api/login`, `/api/register`, `/api/change-password`, or the password-reset flow. This allows credential stuffing and brute-force at ~3 attempts/second per IP.
**Fix:** Add a tight per-route limiter (e.g. 10 req/15 min) on all auth and password-reset endpoints.

---

### 8. XSS — Unescaped `winnerUsername` Inserted into `innerHTML` (Admin Wheel)
**File:** `admin-wheel.js:61`
**Code:**
```js
tr.innerHTML = `<td>…</td><td>${sp.winnerUsername}</td><td>…</td>`;
```
`sp.winnerUsername` comes from the server and is inserted directly into `innerHTML` with no escaping. A username containing `<script>` or `<img onerror=…>` executes in the admin context, enabling session hijacking of the admin account.
**Fix:** Use `escapeHtml(sp.winnerUsername)` (the helper already exists in the codebase) before inserting into HTML.

---

### 9. XSS — Unescaped Error Message Inserted into `innerHTML`
**File:** `admin-afl-tipping.js:574`
**Code:**
```js
areaEl.innerHTML = `<p style="color:#ef4444;">Failed to load round: ${err.message}</p>`;
```
If a server error response contains a crafted message with HTML/JS, it will execute in the admin's browser.
**Fix:** Use `textContent` or escape `err.message` before placing it in `innerHTML`.

---

## MEDIUM

### 10. User Enumeration via Registration Endpoint
**File:** `server.js:1842`
**Code:**
```js
if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Username already exists' });
}
```
Distinct error messages for "username taken" vs "registration successful" allow an attacker to enumerate valid usernames. Combine with the 200 req/min rate limit and this becomes trivially automatable.
**Fix:** Return a generic message, or implement CAPTCHA.

---

### 11. Profile Picture Stored as Raw Base64 in JSON (DoS / Storage Exhaustion)
**File:** `server.js:241, 2654`
**Code:**
```js
profilePic: String(profile.profilePic || '').slice(0, 250000),
// Upload cap:
if (isDataImage && next.profilePic.length > 220000) { … }
```
Profile pictures up to ~220 KB each are stored inline inside the flat-file `store.json`. There is no apparent limit on profile-update frequency. Repeated uploads by many users will balloon the JSON file, causing slow reads/writes and potential OOM on the Node process.
**Fix:** Store uploaded images in a dedicated file or object-storage bucket; keep only a URL in the profile record.

---

## Summary Table

| # | Severity | File | Line(s) | Issue |
|---|----------|------|---------|-------|
| 1 | CRITICAL | server.js | 13 | Hardcoded JWT secret fallback |
| 2 | CRITICAL | server.js | 76, 106 | Hardcoded admin password + silent migration reset |
| 3 | CRITICAL | server.js | 4026, 4039 | `round` used before declaration → ReferenceError |
| 4 | HIGH | server.js | 1713 | Content Security Policy disabled |
| 5 | HIGH | server.js | 4413 | Unauthenticated profile-summary leaks private data |
| 6 | HIGH | server.js | 1831+ | Weak 6-character password minimum |
| 7 | HIGH | server.js | 1742 | Global rate limit too permissive (200/min) |
| 8 | HIGH | admin-wheel.js | 61 | XSS — unescaped `winnerUsername` in `innerHTML` |
| 9 | HIGH | admin-afl-tipping.js | 574 | XSS — unescaped `err.message` in `innerHTML` |
| 10 | MEDIUM | server.js | 1842 | User enumeration via registration |
| 11 | MEDIUM | server.js | 241, 2654 | Base64 profile pics in flat JSON (DoS risk) |
