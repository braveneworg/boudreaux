# Concurrent create() calls race the read-back on fresh collections

Concurrent `prisma.<model>.create()` calls as the first writes to a FRESH Mongo
collection intermittently race Prisma's post-insert read-back in CI ("required
to return data, but found no record(s)") — bulk-seed with a single `createMany`
instead of `Promise.all(create)`.

It bit again on 2026-10-16 (CI run 2545, `main`): the download-gate counters
contract spec created its two fixture releases with
`Promise.all([release('r1'), release('r2')])` in `beforeAll`, and the second
`create()` found no record on the fresh `release` collection. When each row's
id is needed back, `createMany` does not help (it returns only a count) —
await the creates one at a time instead. The same shape in
`artist-where.contract.spec.ts` was fixed in the same PR.
