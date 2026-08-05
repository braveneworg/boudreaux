# Enrichment Release-Date Auto-Apply Persists — Design Spec

- **Date**: 2026-08-04
- **Branch**: `fix/enrichment-autoapply-persist` (off main `0e6ae119`, v4.296.0)
- **Status**: Approved design (user, 2026-08-04), ready for implementation

## Problem

User-reported: a typed/saved release date gets overwritten — the field feels
non-editable. Root cause (confirmed in code): the enrichment release-date
auto-apply (`use-autoapply-release-date.ts`, #692) writes the suggestion into
the RHF form only — deliberately "never the server" — while the explicit Apply
button resolves the suggestion via `applyVideoSuggestionAction` →
`markApplied`. Save does not resolve suggestions either. So an auto-applied
suggestion stays `pending` in Mongo forever, and both auto-apply guards reset
per visit: `appliedIds` is a per-mount ref, and the dirty-guard cannot protect
a SAVED date (after `form.reset` to row values it reads clean). Every edit-page
visit re-applies the stale suggestion over the admin's chosen date; the next
Save persists the wrong value. Loop repeats until the suggestion is manually
applied or dismissed.

## Decision

**When the auto-apply fires, also resolve the suggestion server-side through
the existing explicit-apply path** (`useApplyVideoSuggestionMutation` /
`applyVideoSuggestionAction` → `markApplied`). First enrichment still
populates the field automatically (requirement: "still attempt to populate it
for the video uploaded" — unchanged, including the empty-only web-lookup
fill); once applied, no pending suggestion survives to re-clobber later
visits, and the panel history shows it as applied.

Rejected: comparing against the draft's default date (cannot distinguish a
deliberate "today"); a new `autoApplied` status (extra plumbing, no behavioral
gain over the existing `applied` marking). This deliberately reverses #692's
client-only choice.

## Design

1. `useAutoApplyReleaseDateSuggestion` gains the videoId and the apply
   mutation (or a `onResolveSuggestion(suggestionId)` callback wired by the
   panel to the existing mutation — match the panel's current wiring style).
   On fire: client `onApply` first (the field populates regardless of network),
   then resolve server-side.
2. Failure handling: a failed server resolve surfaces the shared apply
   mutation's error toast (deviation from the earlier "silent" draft — the
   toast is more honest and reuses the existing path); the client fill stands,
   `appliedIds` still guards the session, and the next visit may re-apply —
   acceptable degraded mode (strictly no worse than today), no retry loop.
3. The suggestion-status poll invalidation already refreshes the panel; the
   applied suggestion renders via the existing applied/muted row states (#698
   pattern). No schema, wire, or action changes.
4. Guards unchanged: dirty-guard + per-mount `appliedIds` still prevent
   within-session double-writes while the poll catches up.

## Testing (TDD)

- Regression (the user's loop): suggestion pending + clean form → auto-apply
  fires once AND calls the resolve path with the suggestion id.
- Resolve failure → client fill remains, no throw, no re-fire within session.
- Dirty field → neither client apply nor server resolve fires.
- Already-non-pending suggestion → nothing fires (existing behavior).
- Panel-level: auto-applied suggestion moves to the applied rendering once the
  poll returns the updated status (existing components; assert wiring only).

## Out of scope

- The empty-only web-lookup auto-fill (already safe).
- Marking suggestions applied on Save (broader contract change, not needed
  once auto-apply resolves).
- Other suggestion fields (description/featured artist have no auto-apply).
