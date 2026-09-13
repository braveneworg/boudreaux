# A free-tier dependency that only enforces a limit must fail open

The production Upstash Redis (free tier) was deleted for inactivity
(2026-09-13). It backed only the chat rate limit, the abuse-report rate
limit, and the @mention email throttle — nothing user-visible on its own —
yet chat sends and abuse reports threw for days, and `/api/health` stayed
green because it only checked Mongo. Nobody noticed until a user did.

Rules, now implemented in `limitWithFallback` (`src/lib/utils/redis-fallback.ts`),
`ChatMentionService.notifyMentions`, `checkRedisHealth`, and
`.github/workflows/redis-keepalive.yml`:

- A dependency that only enforces a limit fails OPEN on the user action
  (same numeric limit from the in-memory `rateLimit` util) and warns once.
- A dependency that only bounds a side effect (emails) fails CLOSED on the
  side effect — skip it, never send unbounded — and must never reject a
  request that already succeeded.
- Every external dependency gets a field on `/api/health`, without changing
  the status code unless the app truly cannot serve.
- Every free tier with an inactivity policy gets a scheduled keepalive that
  goes red when the resource is gone, and its notice emails must reach a
  monitored inbox.
