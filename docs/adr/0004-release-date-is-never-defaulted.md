# ADR-0004: A Video's release date is never defaulted

- **Status**: Accepted
- **Date**: 2026-09-14

## Context

`Video.releasedOn` was a required column. A draft row is created the moment an
upload completes, before any lookup has had a chance to run, so the draft
action had to put _something_ in the column — and it put **today**. That one
stamp produced a chain of defects that four PRs chased without removing the
cause:

| PR   | Symptom fixed                                                     | Left behind                                |
| ---- | ----------------------------------------------------------------- | ------------------------------------------ |
| #681 | "Find release date" looked broken (open web lacks premiere dates) | the stamp                                  |
| #693 | enrichment overwrote a date the admin had just typed              | a dirty-guard that also blocked real fills |
| #699 | the container's date tag leaked into the field                    | the stamp                                  |
| #707 | enrichment re-applied its date on every visit                     | a resolve that the server always rejected  |

The stamp also fed the enrichment Lambda's description prompt
("Release date: 2026-09-14"), so generated prose claimed the video was released
today, and on every revisit the non-empty field stopped the automatic lookup
from running at all.

## Decision

**A release date is never inferred. Today only ever appears because a human
typed it.**

- `Video.releasedOn` is nullable. The draft action leaves it unset.
- The web `ReleaseDateLookupService` treats a result equal to today's UTC day
  as a miss (`null`). This is the single choke point over both Lambda tiers and
  the fake path, per [ADR-0002](0002-business-logic-stays-in-services.md).
- The description Lambda states a release date only when one is supplied; a
  dateless draft is described as such, never as "today", "recently", or a
  guessed year.
- Enrichment's release-date suggestion fills only an **empty** field on its
  own; otherwise it stays a pending suggestion.
- Save and Publish still require a date. `VideoService.publishVideo` refuses a
  dateless row with `VALIDATION` copy, closing the list-level Publish bypass
  that never went through the form's validation.

## Why this is surprising without context

- The form field _looks_ required, but the row is not. A reader who sees the
  nullable column and the required Zod schema will suspect drift; it is the
  point.
- **published ⇒ dated** is enforced in `VideoService`, not in the schema.
  Mongo cannot express the conditional, and a database-level default would
  reintroduce the stamp.
- Dateless drafts sort **last** in the default descending admin list. That is
  Mongo's null ordering, accepted rather than worked around, because only
  drafts can be dateless and drafts are the rows an admin is about to finish.

## Why this is hard to reverse

Restoring a required column would need a backfill that invents a date for every
dateless draft — exactly the guess this decision forbids. The nullable column
is also load-bearing for the automatic lookup, whose gate is "the field is
empty"; a sentinel would need its own "looks empty" logic in every consumer.

## Trade-offs accepted

- Null handling across roughly eight consumers (cards, admin list, enrichment
  service, description prompt, form helpers, Zod schema, domain types).
- PR #693's dirty-guard is gone. Its purpose (protect a typed date) is now
  served by the emptiness rule: a typed date is non-empty, so nothing fills it.
- The list-level Publish action can now fail with user-facing copy instead of
  silently succeeding on a stamped date.
- The single-field release-date autosave does not stamp `updatedBy`, matching
  the poster-pick action.

## Alternatives considered

- **A sentinel date** (epoch, `9999-12-31`). Rejected: every consumer, sort,
  and prompt would need to know the sentinel, and it would still be a date the
  Lambda could quote.
- **A `releaseDateIsPlaceholder` flag beside a required column.** Rejected:
  two fields to keep consistent, and the stamped value still leaks anywhere the
  flag is forgotten — the Lambda prompt being the first casualty.
- **Keep the column required and treat emptiness as client-only.** Rejected:
  the draft row is created server-side before the client knows a date, so the
  server would still have to invent one.
- **Enforce published ⇒ dated in the form only.** Rejected: the admin list's
  Publish action bypasses the form; the service is the only place both paths
  meet.
