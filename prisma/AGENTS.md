# prisma/ — Schema & seed

- MongoDB via Prisma 6. Push schema with `pnpm exec prisma db push`; browse
  with `pnpm exec prisma studio`; dev seed via `pnpm run seed` (tsx
  prisma/seed.ts).
- Never run seed/migrations/studio/builds in a process that could inherit
  `DATABASE_URL` from `.env*` — read the isolation rules in
  [`e2e/AGENTS.md`](../e2e/AGENTS.md) first; they are a hard constraint.
- Load `docs/lessons/prisma-mongo/` before query or seed changes.
