# ADR-0018: Download entitlement is decided by one gate

- **Status**: Accepted
- **Date**: 2026-10-01

## Context

"May this subject download these formats of this release" had no owner. Three
routes (`bundle`, `[formatType]`, the playlist download) and one uncalled
`confirm` route each chained their own services, and the chains disagreed:

- Two definitions of "has purchased". The bundle route used the
  refund-filtered purchase lookup; the single-format route used the unfiltered
  twin, so a refunded buyer could still download single formats.
- Four counters that nobody had reconciled. A **lifetime cap**
  (`UserDownloadQuota`: five distinct releases per user) on the single-format
  and playlist routes; a **free throttle** (`DownloadEvent` rows: three per
  release per rolling 24 hours, any subject) on the bundle route; a
  **purchase throttle** (`ReleaseDownload.downloadCount`: five per release,
  reset after six idle hours) plus its guest twin (`GuestDownloadCount`) on the
  bundle and confirm routes. Paid single-format downloads counted against the
  bundle's free throttle because the free throttle read every success row.
- Charging before delivering. The single-format route incremented the lifetime
  cap before its 410/500 branches; the `confirm` route charged the purchase
  throttle on the client's say-so and had no caller.
- A dead grace period. The soft-delete grace path was unreachable because the
  format lookup filtered deleted rows out first, so a buyer lost a format the
  moment an admin soft-deleted it.
- A per-process lock acquired after the cap check it was meant to protect, and
  a `?mode=free` query parameter that let the client choose which rules
  applied.

The single-format route's only client, `FormatDownloadList`, is imported by
nothing: the live UI calls the bundle route and the playlist route.

## Decision

**One module, `DownloadGate`, owns the decision and the charge. Routes are
HTTP adapters: they resolve the subject, hand the gate a producer for the
deliverable, and map the gate's outcome to a response.**

```ts
DownloadGate.download({ subject, releaseId, formats }, produce) → Outcome
DownloadGate.status(subject, releaseId) → DownloadStatus
```

Inside the gate: acquire the lock → gather facts → `decide(facts)` (pure) →
`produce(grant)` → commit the counters and the audit row → release the lock.

The rules the gate enforces:

- **Entitlement is a non-refunded purchase.** `refundedAt` unset. One
  definition, used everywhere. A refund revokes it.
- **The gate decides the mode; the request carries only intent.** An entitled
  subject downloads in `purchased` mode whatever formats it asks for; any
  other subject downloads in `free` mode, limited to the free formats. The
  `mode` query parameter is gone.
- **Two throttles, one interface.** Free mode: the lifetime cap (signed-in
  users only) and the free throttle (any subject). Purchased mode: the purchase
  throttle. Paid downloads write an audit row but never tick the free
  throttle: `DownloadEvent.mode` records which rules applied, and the free
  throttle counts only `free` rows.
- **Charge after the deliverable exists, before the response leaves.** A
  failure before the deliverable exists charges nothing and writes a failed
  audit row with its reason. The client-confirmed `confirm` route is deleted.
- **A withdrawn (soft-deleted) format stays available to an entitled subject
  until it is hard-deleted; free mode never gets it.** The "anyone within 90
  days" and "buyer forever" grace rules are dropped: the S3 object is removed
  on hard delete, so "forever" was a promise the storage could not keep.
- **Every free format counts alike.** MP3 and AAC both tick the lifetime cap
  and the free throttle, on every path. The playlist download's exemption of
  MP3 from the cap and the lock ends; the constants comment that called MP3
  "no quota" described a rule only that route followed.
- **A guest is always on the free tier.** Purchases belong to users (guest
  checkout creates the user by email), so a guest subject never holds
  entitlement and the guest purchase-throttle counter was unreachable.
- **The lock is an internal seam with one in-process adapter.** Production is
  one container; a Mongo compare-and-swap adapter drops in if that changes.

`DownloadAuthorizationService`, `QuotaEnforcementService`,
`FreeDownloadQuotaService` and `FreeDownloadLockService` fold into the gate.
Guest identity resolution moves to its own module; `PurchaseService` keeps
`checkExistingPurchase` for checkout.

## Consequences

- `DownloadEvent` gains an optional `mode` (`free | purchased`). Rows written
  before this change have no `mode` and stop counting toward the free throttle
  for the 24 hours it takes the rolling window to pass them. No backfill.
- The free throttle is tighter than the purchase throttle (three per 24 hours
  against five per six idle hours). That is the accepted shape: a buyer gets
  the more generous rule.
- A buyer whose download breaks repeatedly can still exhaust the purchase
  throttle, because the charge is made when the deliverable exists, not when
  the bytes land. Delivery confirmation from the client was rejected as
  untrustworthy.
- A free user's MP3 playlist now counts each release against the lifetime cap,
  so a playlist of more than five releases is refused on the free tier where
  it used to download. That is the rule applied evenly, not a regression to
  fix.
- The single-format route survives as an adapter over the gate; its UI client
  is unused and is not restored by this decision.
- Policy is tested once, as a table over `decide`; the four counters have one
  Docker Mongo contract spec; concurrency has one spec at the gate interface.
  The per-service and per-route policy specs are removed with the code they
  tested.

## Alternatives considered

- **One counter for everything.** Rejected: the lifetime cap answers "how
  much free music may a user ever take", the throttles answer "how often may
  one release be re-fetched"; collapsing them loses a product rule.
- **Delivery confirmed by the client.** Rejected: presigned S3 URLs are not
  single-use, so a client that never confirms downloads free forever.
- **Mongo compare-and-swap counter now.** Rejected for now: the free throttle
  is a rolling window over events, not a counter, and production runs one
  container. The lock seam exists so the adapter can be added without touching
  the gate.
- **Let the client keep choosing `mode=free`.** Rejected: a buyer could spend
  the free throttle on purpose, and a guest could skip authentication by
  naming the mode. The gate derives the mode from entitlement.
