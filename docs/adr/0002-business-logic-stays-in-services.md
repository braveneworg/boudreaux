# ADR-0002: Business logic stays in services

- **Status**: Accepted
- **Date**: 2026-07-20

## Context

An architecture review proposed collapsing the "thin" CRUD services into the
repository layer, keeping only the services that carry policy. It made the case
with real measurements, recorded here so this decision can be judged against the
same evidence rather than re-derived:

- **144** service static methods sit over **234** repository static methods.
- `video-service.ts` has 10 methods, **9** of which are mechanically
  `try { return { success: true, data: await VideoRepository.x() } } catch { failFromError(...) }`.
- `publishVideo` and `unpublishVideo` differ from each other only by
  `new Date()` vs `null` and one message string.
- `producer-service.ts` is 2 methods over 3 repository calls.
- Applying the deletion test to those thin methods: deleting them concentrates
  nothing. Only the `try`/`catch` moves — and [ADR-0001](0001-service-failures-carry-a-data-error-code.md)
  plus the decorator error boundary relocate that anyway.

The counter-consideration is that the repository layer genuinely earns its
place: only 12 of 234 repository methods are literal `{ where: { id } }`
one-liners, and it owns the Mongo null-safe `OR`/`AND` nesting, compare-and-swap
job-token claims, and replaced-file race guards.

## Decision

**All business logic remains in services. The service layer stays as it is,
including the methods that are currently thin pass-throughs.**

Callers — Server Actions and API route handlers — go through a service. They do
not reach past it to a repository, even for a plain read or a plain write.

## Rationale

The uniform boundary is the point. A caller should never have to know whether a
given operation happens to carry policy today, and adding a rule to an operation
later must not force its call sites to change layer. A service that is thin
right now is a place for logic to land without a migration.

A "collapse the ones without logic" rule also has no stable answer: the set of
operations carrying policy changes over time, so the layering would churn, and
two operations on the same model could sit at different depths.

## Consequences

- Reviews will keep surfacing the pass-through measurement above. That is a
  false positive here. **This ADR is the answer; do not re-propose it.**
- A new entity gets a service even when its first version only forwards to a
  repository.
- New orchestration belongs in a service, not in an action helper module. This
  applies directly to the pending work to give video post-save scheduling a
  home: that module is a service, not another `*-action-helpers.ts` export.
- The cost is accepted: some services will read as ceremony. The consistency of
  the boundary is worth more than the lines saved.

## Alternatives considered

- **Collapse thin services; keep only policy services.** Rejected — see above.
- **Allow callers to use repositories directly for plain CRUD, services only
  where logic exists.** Rejected: this is the same churn problem, and it also
  breaks the guarantee that the Prisma seam is only ever crossed in one layer.
