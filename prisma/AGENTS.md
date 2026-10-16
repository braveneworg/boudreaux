# prisma/ — Schema & seed

- MongoDB via Prisma 6. Push schema with `pnpm exec prisma db push`; browse
  with `pnpm exec prisma studio`; dev seed via `pnpm run seed` (tsx
  prisma/seed.ts).
- Run seed, `db push`, migrations, and studio only with `DATABASE_URL` scoped
  to the command and pointing at the dockerized MongoDB (`localhost:27018`) —
  worktrees carry real `.env*` copies, and `prisma.config.ts` loads `.env` for
  anything the shell leaves unset. Read the isolation rules in
  [`e2e/AGENTS.md`](../e2e/AGENTS.md) first; they are a hard constraint.
- `prisma/seed.ts` runs under plain `tsx`, so it must not import any module
  that imports `server-only` (services, repositories, `@/lib/prisma`, the
  logger) — it writes through its own `PrismaClient`.
  `prisma/seed.spec.ts` walks its import graph and enforces this. The fix is
  never to remove `server-only` or to run the seed under the React Server
  export condition.
- Production gets schema changes from the deploy: `deploy.yml`'s
  `schema-push` job runs `prisma db push` before the roll when
  `schema.prisma` changed (ADR-0012). No manual post-merge push, except for
  a destructive change, which fails the deploy and is applied by hand.
- Every version must be readable by the version before it (expand, then
  contract). A PR may add fields and indexes and start writing new shapes;
  it never removes a field, changes a field's type, or drops an index in the
  same version that stops writing the old shape. The removal ships one
  version later, once the version before it already tolerates the absence.
  This is what makes a one-step rollback safe: the rollback never pushes
  the schema and never rewrites documents (ADR-0021), and its schema
  tripwire stops on exactly the changes this rule forbids.
- Load `docs/lessons/prisma-mongo/` before query or seed changes.
