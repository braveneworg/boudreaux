# ADR-0001: Service failures carry a `DataErrorCode`

- **Status**: Accepted
- **Date**: 2026-07-20

## Context

`DataError` has always carried a stable, vendor-neutral `DataErrorCode` — the
repository layer translates Prisma's taxonomy into it precisely so that no layer
above the repository has to know about Prisma.

That code was then thrown away one layer later. `failFromError` returned
`{ success: false, error: string }`, and `ServiceResponse`'s failure arm had no
slot for a code. Everything downstream that needed to distinguish one failure
from another had to re-derive it from the user-facing English.

At the time of writing, that produced:

- **38** `error === '<literal>'` comparisons across **12** API route files, of
  which **22** compared the single literal `'Database unavailable'` — a string
  defined once, in `map-data-error.ts`.
- A third dialect, case-insensitive substring matching (`msg.includes('not
found')`), in the action layer.
- Two service methods (`banner-notification-service.ts`) overriding the
  `UNAVAILABLE` copy to `'Database connection failed'`. No route consuming them
  compares the string, so nothing was broken in production — but any route that
  later added the usual mapping would have silently returned 500 for an outage,
  with no type error and no failing test.
- Routes that skip mapping altogether returning **500 for a database outage**
  where 503 is correct (`/api/notification-banners`).

The common defect: **user-facing copy was load-bearing for HTTP semantics.**
Editing a message could change status codes at 22 call sites, and no compiler
edge existed anywhere on that path.

## Decision

The failure arm of `ServiceResponse<T>` carries the code:

```ts
export type ServiceResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: DataErrorCode };
```

`code` is **required**, not optional. An optional field would let call sites
silently omit it and reproduce exactly the fails-open pattern this ADR removes.
Requiring it means the compiler names every site that must state its intent.

A single total lookup, `httpStatusForCode` (`src/lib/utils/http-status-for-code.ts`),
maps code to HTTP status. It is typed `Record<DataErrorCode, number>`, so adding
a code to `DataErrorCode` without deciding its status is a compile error.

`error` and `code` are independent by design: `error` is copy and may be
overridden per call site; `code` is the stable fact callers branch on.

## Consequences

- Route handlers read status from `httpStatusForCode(result.code)`. Comparing
  `result.error` against a literal to determine behaviour is now a defect.
- Copy is free to change without touching HTTP semantics.
- Every hand-rolled `{ success: false, error }` in a service had to declare its
  code. That was 29 sites; each is now explicit about whether it means
  `NOT_FOUND`, `VALIDATION`, `DUPLICATE`, `INVALID_INPUT`, or `UNKNOWN`.
- Test fixtures that stub a service failure must supply a code. This is a
  feature: a test asserting 503 now says `UNAVAILABLE` rather than relying on a
  message spelled the same way in two files.

## Alternatives considered

- **Optional `code`.** Rejected: preserves the silent-omission failure mode.
- **Throw `DataError` all the way to the route and catch it there.** Rejected:
  `ServiceResponse` is the established convention across 19 modules, and this
  would have been a much wider behavioural change for the same benefit.
- **Keep string matching, centralise the literals as constants.** Rejected:
  couples HTTP semantics to copy permanently, just with better spelling. It also
  cannot express "this service overrode the message but it is still an outage."
