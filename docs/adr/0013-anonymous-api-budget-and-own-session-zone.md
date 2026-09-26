# ADR-0013: One /api/ budget for everyone; the session read gets its own zone

- **Status**: Accepted
- **Date**: 2026-09-26

## Context

`location /api/` in `nginx/nginx.conf` rate-limits every `/api/` request,
admin and anonymous alike, in one zone keyed on the client IP:
`zone=api rate=10r/s`, `burst=50 nodelay`. #764 sized that burst for an
admin page mount, but nobody had decided what an anonymous visitor's budget
should be (#766).

Measured on 2026-09-21 (dev server, anonymous, network idle), a public page
load makes exactly one `/api/` call, `GET /api/auth/get-session`, and
`/playlists` makes two. First paint is server rendered and never reaches the
zone. The better-auth client also re-reads the session on window focus. What
fans out is interaction: debounced search comboboxes, infinite scroll, the
player, and downloads.

The zone is per IP, and a venue's Wi-Fi, a school, an office, or a mobile
carrier's CGNAT presents a whole room as one address. On such an address,
page loads and the room's searches drew from the same 10 r/s.

nginx is not the only ceiling. better-auth's own limiter is on in production
(`rateLimit.enabled`, `src/lib/auth.ts`) and applies its default rule to
`/get-session`: 100 requests per 10 s, a fixed window keyed per (IP, path).
Any nginx allowance above 10 r/s for the session read was cosmetic, because
the app answered the 101st read in a window with its own 429.

## Decision

**The `/api/` budget is 10 r/s sustained, burst 50 per IP, for anonymous and
admin traffic in one zone. The session read leaves that zone for its own:
30 r/s, burst 150 per IP, matched by better-auth's limit on the same path.**

- `location = /api/auth/get-session` limits by `zone=session` (30 r/s,
  burst 150). Its other directives are identical to `location /api/`, and
  `nginx/nginx.conf.spec.ts` enforces that parity. 30 r/s is about 150
  visitors behind one address, each navigating every 5 s; burst 150 is
  enough for a room that reloads at once. The `=` match captures only that
  exact path, so the OAuth callback stays in the general zone
  (`docs/lessons/nginx/oauth-callback-never-in-a-strict-zone.md`).
- `rateLimit.customRules['/get-session']` is `{ window: 10, max: 300 }`, the
  same 30 r/s, so the app does not undercut nginx. Every other auth path
  keeps better-auth's defaults, including the 3-per-10 s caps on
  `/sign-in*` and `/sign-up*`. The read is cheap: the 5-minute cookie cache
  answers signed-in users, and an anonymous request returns `null` before
  any database lookup.
- The `/api/` zone stays at 10 r/s and burst 50, and the numbers are now
  pinned in the spec and written into the nginx comment as a decision. A
  single browser cannot trip it. A shared IP now competes only on
  interaction, not on page loads, and the client backs off 429s with jitter
  and honours `Retry-After` (`src/lib/utils/query-retry.ts`).
- The Grafana panel "nginx 429s by path prefix (5m)" (dashboard "Application
  Logs") charts nginx's own 429s from the access log, with get-session
  separate from `/api/<resource>`. Before this, no dashboard showed nginx
  429s at all: the existing "429" series counts only the app's
  `withRateLimit` rejections. Change either budget only after that panel
  shows a need.

## Alternatives rejected

- **A separate admin zone** (`location ^~ /api/admin/`, or a `map` on the
  session cookie that picks a looser zone for signed-in users). Admin routes
  are not grouped under one prefix, so the location form would mean moving
  routes. A cookie `map` trusts a cookie's presence, not its validity, so
  anyone could claim the looser zone by sending any value. The one admin on a
  busy network is not the failure the measurements showed.
- **Exempting get-session from nginx entirely.** That leaves a per-request
  Node.js handler with no edge cap, and better-auth's in-memory limiter would
  be the only one. A generous zone costs nothing for real traffic and still
  bounds a flood.
- **nginx only, leaving better-auth at 100 per 10 s.** The nginx zone would
  be cosmetic above 10 r/s, and the app's 429 would still hit the room.

## Consequences

- nginx.conf has one more location block that duplicates the `/api/` proxy
  directives (the file has no include/snippet pattern). The parity spec fails
  if the two drift apart.
- A flood of session reads from one IP is capped at 30 r/s instead of
  10 r/s. The handler does no database work for anonymous requests, so the
  extra ceiling is cheap.
- Raising or lowering the session budget means changing two places, the
  nginx zone and the better-auth custom rule. Both are pinned by specs that
  name this ADR.
- The effect is visible only in production: CI E2E talks to the standalone
  server directly, and better-auth's limiter is off under E2E. Verify with a
  smoke test from one IP: 100 back-to-back get-session requests (inside the
  burst) and then 250 paced at 25 per second (under both ceilings) all return 200. Then watch the panel.
