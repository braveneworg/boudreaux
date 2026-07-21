# CI-only "ambient" signed-out flakes were better-auth's rate limiter

The suite's CI-only "ambient" signed-out flakes (signed-in UI intermittently
rendering signed-out — e.g. download-dialog's `getByRole('combobox')` not
found) were better-auth's BUILT-IN rate limiter: it defaults ON whenever
`NODE_ENV=production`, which includes the CI E2E standalone
(`node .next/standalone/server.js`) but never local E2E (`next dev`) — so no
local recipe could reproduce it. Three CI workers behind 127.0.0.1 blow the
default 100-req/10s per-IP budget → `GET /api/auth/get-session` 429s → the
client session stays empty while SSR (cookie-based) still renders
purchase/admin state. Fixed with `rateLimit: { enabled: isProductionRuntime }`
in `src/lib/auth.ts`. When a CI-only flake defies local repro: FIRST download
the failing run's Playwright trace and read its network log
(`0-trace.network` — the download-dialog trace showed the 429 outright), and
diff prod-standalone vs dev-server runtime behavior before blaming the spec.
