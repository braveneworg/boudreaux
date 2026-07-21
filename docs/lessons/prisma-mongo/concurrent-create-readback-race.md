# Concurrent create() calls race the read-back on fresh collections

Concurrent `prisma.<model>.create()` calls as the first writes to a FRESH Mongo
collection intermittently race Prisma's post-insert read-back in CI ("required
to return data, but found no record(s)") — bulk-seed with a single `createMany`
instead of `Promise.all(create)`.
