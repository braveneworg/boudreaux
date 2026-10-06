# The E2E database has no collection until something writes to it

Nothing pushes the Prisma schema to the E2E database. The seed only clears
collections with `deleteMany`, which creates nothing. A collection the seed
never writes therefore comes into being with its first insert, part way
through the suite.

Mongo aborts a transaction whose insert creates a collection while another
write creates the same collection. Prisma reports it as
`Transaction API error: Transaction with { txnNumber: N } has been aborted.`
On 2026-10-05 the video enrichment spec failed this way in CI (#836): the
run's `replacePending` transaction lost to another spec's first suggestion
write, and the status chip showed "Failed". A probe on a scratch database
aborted 20 of 20 times with the collection absent and 0 of 20 with it
present.

Production never meets this, because its schema push creates every
collection. The seed now calls `ensureModelCollections` (in
`e2e/helpers/e2e-collections.ts`), and `seed-collections.spec.ts` fails if
any model's collection is missing after the seed.

Rules:

- Do not remove `ensureModelCollections` from the seed, and do not rely on
  a first write to create a collection.
- A failure whose error names an aborted transaction, or a missing record
  right after a create, on a collection the seed never writes, is this race.
  See also `../prisma-mongo/concurrent-create-readback-race.md`.
