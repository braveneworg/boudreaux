# The E2E DB is seeded by e2e/helpers/seed-test-db.ts, not prisma/seed.ts

`prisma/seed.ts` seeds the DEV database; the Playwright suite seeds its
isolated Mongo through `e2e/helpers/seed-test-db.ts` (invoked from
`e2e/global-setup.ts`). The two deliberately mirror the same default rows.
A seed change made only in `prisma/seed.ts` has ZERO effect on E2E runs —
a 2026-08 plan shipped exactly that trap and the spec would have gone red
against an unseeded field. When changing seeded data, edit BOTH files and
keep the mirrored rows byte-equivalent.
