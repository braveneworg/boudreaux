# Admin Delete Flows & DataView Raw-Fetch Removal — Code-Review Decisions

> Branch: `refactor/rhf-mutation-hooks`. This document records the high-effort
> `/code-review` findings on the delete/publish/restore work and explains the
> choice made for each — what was changed, what was deliberately left alone, and
> why. It is the rationale companion to the diff.

## Scope reviewed

- 7 single-id admin Server Actions (delete/publish/restore for featured-artist,
  artist, release) + their service methods, mutation hooks, and specs.
- `EntityDeleteButton` and its integration into the featured-artist / artist /
  release edit forms.
- The `DataView` refactor that removed raw `fetch` in favor of injected
  `onPublishEntity` / `onDeleteEntity` / `onRestoreEntity` callbacks, plus the
  three `*-data-view` wrappers that wire them.

The review ran 8 finder angles (3 correctness, reuse/simplification/efficiency,
altitude, conventions) over the working-tree diff, then verified candidates.

---

## Findings and decisions

### 1. Silent no-op restore when a wrapper omits `onRestoreEntity` — FIXED

**Finding (correctness).** `DataView` decided "Restore vs Delete" purely from
`supportsSoftDelete && item.deletedOn`. If a future entity were wired with a
soft-delete data shape but no `onRestoreEntity`, the row could render a "Restore"
button whose handler returned `undefined` — the confirm dialog would close
looking successful while nothing happened.

**Decision: fix defensively.** Added a per-row
`const showRestore = supportsSoftDelete && !!item.deletedOn && !!onRestoreEntity`
and routed all six UI branches (label, icon, variants, dialog copy, dispatch)
through it. When no restore handler is wired, a deleted row now falls back to
"Delete" instead of offering an action it cannot perform.

**Why:** the generic component should be self-consistent, not rely on every
caller configuring it perfectly. No current caller hit this (artist passes a
restore handler; release/featured-artist are hard-delete), so it is purely
hardening with zero behavior change for existing entities.

### 2. `runEntityMutation` swallowed the real rejection error — FIXED

**Finding (correctness/diagnostics).** The `catch` always toasted
`"... : Unknown error"`, discarding a descriptive `Error` (e.g. a Server Action
transport failure). The old raw-`fetch` path at least `console.error`-ed it.

**Decision: preserve the message.** The catch now reads
`err instanceof Error ? err.message : 'Unknown error'` and surfaces it in the
toast. A dedicated spec covers both the `Error` and non-`Error` reject paths.

**Why:** production failures on this path were undiagnosable; showing the real
message costs nothing and is consistent with how the rest of the UI reports
errors.

### 3. Seven near-identical Server Action files — FIXED (your decision: extract)

**Finding (reuse).** The 7 actions repeated the same contract: `requireRole` →
`isValidObjectId` → service call → `logSecurityEvent` → `revalidatePath` →
plain result.

**Decision (you chose "extract shared helper").** Added
`src/lib/actions/run-admin-entity-action.ts` — a server-only helper taking a
declarative config (`id`, `entityLabel`, `perform`, `event`, `metadataKey`,
`revalidate`, `failureError`). Each action file is now ~10 declarative lines.
The helper has its own spec; the 7 per-action specs still pass unchanged because
behavior is identical (they mock `requireRole`/`revalidatePath`/`logSecurityEvent`
at their source modules, which the helper imports).

**Why:** one place to evolve the cross-cutting contract (e.g. add `withRateLimit`
or change the result shape) instead of editing 7 files and risking drift. The
per-action files remain as thin, named, greppable entry points.

### 4. `window.confirm` in the new forms vs the CLAUDE.md rule — FIXED (your decision: AlertDialog + shared component)

**Finding (conventions).** CLAUDE.md states: _"Never use `alert` / `prompt` — use
shadcn/ui dialogs."_ The three new form delete handlers used `window.confirm`
(mirroring the pre-existing `tour-form`). The repo ships `alert-dialog.tsx`.
Separately, the three `handleDelete` functions were near-identical (simplification
finding).

**Decision (you chose "AlertDialog + shared hook for the new forms").** Added
`src/app/components/forms/entity-delete-button.tsx` — a reusable destructive
button gated by a shadcn `AlertDialog`, owning its `isDeleting` state and the
`onDelete → toast → router.push + refresh` flow. All three forms now render it
and dropped their bespoke `handleDelete` + `window.confirm`. Form delete specs
were rewritten to drive the dialog (trigger → confirm).

**Implementation note — "hook" vs "component".** You phrased the option as a
shared `useEntityDelete` _hook_. A bare hook is awkward here because the reusable
unit is _JSX + behavior_ (a dialog plus its confirm flow), and a hook returning
JSX is non-idiomatic. It was therefore realized as a **component**
(`EntityDeleteButton`) whose internals are simple `useState` + `useRouter`. The
intent you selected — one shared, rule-compliant delete control instead of three
copies — is fully met.

**Deliberately scoped out:** the pre-existing `tour-form` still uses
`window.confirm`. You chose the "new forms only" option, so `tour-form` was left
untouched to keep this change within the refactor's scope; migrating it is a
clean follow-up.

### 5. Redundant double-fetch after a mutation — ACCEPTED (no change)

**Finding (efficiency).** The mutation hooks invalidate `queryKeys.<entity>.all`
in `onSuccess`, and `DataView` also calls `refetch()`. Both target the active
infinite-list query.

**Decision: accept.** TanStack Query de-dupes concurrent refetches of the same
query key, so in practice this collapses to a single network round-trip. Keeping
the explicit `refetch()` makes `DataView` robust even if a future injected
callback does not invalidate — the component should not assume its caller's
cache semantics. The cost is at most a brief redundant request, not a correctness
issue.

### 6. `as unknown as Artist` casts in the new service methods — ACCEPTED (consistency)

**Finding (conventions).** `publishArtist` / `restoreArtist` cast
`ArtistRepository.update(...)` via `as unknown as Artist`, which CLAUDE.md's
"prefer specific types over `unknown`" discourages.

**Decision: accept, to match the existing pattern.** The pre-existing
`archiveArtist` (and other Artist service methods) already cast this way because
`ArtistRepository.update` returns the Prisma row type, not the service-facing
`Artist`. Diverging in only the two new methods would be inconsistent; the right
fix is a repository-return-type cleanup across all Artist methods, which is out
of scope for this change. (`publishRelease` / `publishFeaturedArtist` need no
cast — their repositories already return compatible shapes.)

### 7. Two "publish" semantics for featured artists — PRE-EXISTING (noted, no change)

**Finding (altitude).** The per-row "Publish" button (stamps `publishedOn` on one
entry) and the page-level "Publish to Landing Page" button (republishes the whole
active set) can confuse an admin who marks rows "Published" yet sees no landing-
page change.

**Decision: out of scope.** The per-row publish predates this work (the old
`DataView` already PATCH-ed `publishedOn` for every entity); this refactor only
routed it through a typed action. The UX disambiguation is a pre-existing product
question, not a regression introduced here. Flagged for product follow-up.

### 8. `supportsSoftDelete` defaults to `true` for an empty list — PRE-EXISTING (noted, no change)

**Finding.** With no rows, `supportsSoftDelete` defaults `true`, so the
featured-artist view can show a "Show deleted" toggle that can never return rows
(the model has no `deletedOn`). Carried over unchanged from the prior
implementation; left as-is to avoid scope creep.

---

## Other decision recorded during the work

**Generic `invalidateQueries<Entity>()` helper — declined.** A type-parameter-keyed
invalidator can't derive a `queryKey` at runtime (generics are erased), and the
per-entity invalidation _sets_ differ (artist invalidates artists **and** releases;
featured-artist invalidates only featured-artists). The only sound generic is a
value-keyed config map, which trades four short, self-documenting helpers for one
indirection. The per-domain `invalidate*Queries` helpers were kept; a map-based
version remains available if desired.

---

## Verification

After the fixes: `pnpm run typecheck`, `pnpm run test:run` (all green),
`pnpm run lint`, `pnpm run format` all pass. E2E
`e2e/tests/admin-entity-delete.spec.ts` (form delete + DataView delete/restore)
passes against the isolated E2E database.

### Known coverage note

Branch coverage sits modestly below the `COVERAGE_METRICS.md` baseline but within
the regression check's 2% tolerance. The remaining gap is concentrated in
pre-existing files unrelated to this change (e.g. digital-format upload hook,
bio-generation service, a download bundle route, UI primitives); the code added
and refactored here is covered by unit, integration, and E2E tests.
