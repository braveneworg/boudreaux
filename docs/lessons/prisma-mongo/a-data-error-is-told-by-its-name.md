# A caught `DataError` can fail `instanceof DataError`

**What happened (2026-11-14).** The repository that stores a view wrote

```ts
try {
  await prisma.submissionViewEvent.create({ data });
  return true;
} catch (error) {
  if (error instanceof DataError && error.code === 'DUPLICATE') return false;
  throw error;
}
```

A duplicate key is the normal case there: it is a viewer's second opening of
a submission on one day. The unit spec passed, and so did the contract spec
on Docker Mongo, which wrote the same key twice and got `false`. On the dev
server the route answered `500` to every repeat view.

The error the route caught was printed from the E2E run: `name: 'DataError'`,
`constructor.name: 'DataError'`, `code: 'DUPLICATE'`. It was a data error in
every field, and `instanceof DataError` was false.

**Why, as far as it was established.** `src/lib/prisma.ts` keeps the client
on `globalThis` outside production, so it is built once, by the first route
the dev server compiles. Its extension raises `DataError` from that route's
copy of `errors.ts`. A repository compiled into another route holds another
copy of the class. `map-prisma-error.ts` already works around the same thing
one layer down, for Prisma's own error class under Turbopack. Whether the
production build can split the class this way was not measured; the E2E
suite passes there with the fix.

Vitest loads every module once, so no unit or contract spec can see it.

**The rule.** A catch that decides something on a data error's code asks
`isDataErrorWithCode(error, code)` (`src/lib/types/domain/errors.ts`), which
reads the name and the code. It does not use `instanceof`.

**How to apply.**

- When a duplicate, a missing row or a conflict is an expected outcome and
  not a failure, the code that says so must be run on the dev server through
  the route that reaches it, twice, before it is called done. An E2E case
  that repeats the request is the proof.
- Give the repository's unit spec a case that rejects with a look-alike:
  `Object.assign(new Error('…'), { name: 'DataError', code: 'DUPLICATE' })`.
  It fails on an `instanceof` check and passes on the guard.
- A `500` whose logged error is the very one the code claims to handle is
  this, before it is anything else. Print the error's `name`, its
  `constructor.name` and its `code` from the failing request.
- Twenty-four other places still test `instanceof DataError`, most of them
  to act on a code: the Stripe webhook's duplicate purchase, the signup and
  username actions, `site-settings-repository.ts`, the artist and user
  services. None was probed. Where the check misses, the code takes its
  generic failure path instead of the one written for that code.
