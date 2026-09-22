# Size `limit_req` burst for page mounts, not single requests

`location /api/` sat at `zone=api` (10 r/s per IP) with `burst=20 nodelay`.
That reads as generous until you count what one SPA page costs: the admin
artist edit page fans out about six `/api/` calls on mount (session, status,
lookups), so twenty tokens is roughly three mounts. list → edit → list → edit
inside a second, or two quick reloads, spent the burst, and nginx answered
the bio-generation status read with a bare 429 (2026-09-21).

It got worse before it surfaced: the TanStack client's global `retry: 1`
re-fired every throttled request of the page at the same +1 s, so the retry
wave was another burst against a bucket still refilling at 10 r/s, and it
429'd too. The public artist pages are server rendered and never pass
through the zone, so they kept showing the images the admin page said did not
exist — see `docs/lessons/ops/silent-query-failure-looks-like-missing-data.md`
for the diagnosis half of this.

Rules:

- Set `burst` from **(requests per page mount) × (mounts a person plausibly
  makes in a second or two) × (a retry wave)** — for the admin pages that is
  ~6 × 3 × 2, so `burst=50`. Keep the sustained `rate` low; burst is where the
  headroom belongs. The grafana zone learned the same thing earlier (50+
  parallel asset requests on page load).
- Pin the fan-out: `e2e/tests/admin-artist-edit-request-budget.spec.ts`
  counts a mount's `/api/` requests. When it grows, either thin the page or
  raise the burst on purpose — never let the two drift apart silently.
- Never let clients retry a 429 in lockstep. Retry only 429/5xx/network
  failures, with exponential backoff + jitter and `Retry-After` honoured
  (`src/lib/utils/query-retry.ts`); a fixed retry delay turns one throttled
  page into two.
- nginx 429s are invisible to CI: E2E talks to the standalone server
  directly. `nginx/nginx.conf.spec.ts` guards the burst value; the effect is
  proven only by a prod smoke (open → back → open, then two fast reloads,
  Network tab open).
