# e2e/ — Playwright E2E

Before writing, running, or debugging specs, read every file in
`docs/lessons/e2e-playwright/` — they encode expensive CI-only failures.

## E2E database isolation (MANDATORY)

E2E tests, the seed script, and the Playwright web server **must** run only
against the local Docker MongoDB container — never a URL from `.env*`, the
shell, or any other source.

- The only acceptable URL is
  `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (container
  `boudreaux-e2e-mongo`). Never read `.env*` to "find" a DB URL — use this
  hardcoded value.
- Never set/export/pass `DATABASE_URL` from the host shell. Pass
  `E2E_DATABASE_URL` (or rely on the hardcoded default in
  `playwright.config.ts` / `seed-test-db.ts`) and let the harness scope it to
  the child process.
- Launch any E2E Node process (web server, seed) with a clean, allowlisted env
  via either the Docker stack (`pnpm run e2e:docker:up`) or `env -i` with only
  `PATH`, `HOME`, `NODE_ENV=test`, `E2E_DATABASE_URL`,
  `DATABASE_URL=mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`,
  `AUTH_SECRET=<test-only>`, `AUTH_URL=http://localhost:3000`.
- Before running, confirm the web server's effective `DATABASE_URL` points to
  `localhost:27018`; if not, refuse to run. The `E2E_SEED_ALLOW_NONLOCAL`
  escape hatch is forbidden.
- Unexpected results (empty seed, "release not found", 404s) → first
  hypothesis is wrong-database. Stop and surface to the user before retrying.

## Practices

- Cover critical user flows and error paths; use fixtures and page objects to
  cut duplication; keep tests deterministic and parallel-safe.
- Commands: `pnpm run e2e:docker:up` / `e2e:docker:down` for the isolated
  Mongo (localhost:27018); `pnpm run test:e2e` for the suite.
- Keep the suite passing during refactors; add specs for new flows and edge
  cases uncovered along the way.
