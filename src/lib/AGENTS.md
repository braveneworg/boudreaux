# src/lib/ — Server layer

Read with [`src/AGENTS.md`](../AGENTS.md).

- `actions/` — Server Actions, `'use server'` at top. Every action validates
  its args with Zod, wraps work in `try`/`catch`, and revalidates as needed.
- `repositories/` — ALL Prisma access lives here (repository pattern); keep DB
  logic out of components and routes. Transactions for multi-step ops; handle
  connection failures gracefully. Load `docs/lessons/prisma-mongo/` before
  query or seed work.
- `services/` — business logic; components stay presentation-focused.
- `decorators/` — `withAuth`, `withAdmin`, `withRateLimit`; gate every
  protected route and action through them.
- `validation/` — Zod schemas for all external input.
- Mark server-only modules with `'server-only'` (specs mock it:
  `vi.mock('server-only', () => ({}))`).
