# prisma/ — Schema & seed

- MongoDB via Prisma 6. Push schema with `pnpm exec prisma db push`; browse
  with `pnpm exec prisma studio`; dev seed via `pnpm run seed` (tsx
  prisma/seed.ts).
- Run seed, `db push`, migrations, and studio only with `DATABASE_URL` scoped
  to the command and pointing at the dockerized MongoDB (`localhost:27018`) —
  worktrees carry real `.env*` copies, and `prisma.config.ts` loads `.env` for
  anything the shell leaves unset. Read the isolation rules in
  [`e2e/AGENTS.md`](../e2e/AGENTS.md) first; they are a hard constraint.
- Load `docs/lessons/prisma-mongo/` before query or seed changes.
