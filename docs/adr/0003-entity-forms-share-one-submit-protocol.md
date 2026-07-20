# ADR-0003: Entity forms share one submit protocol; profile keeps `useActionState`

- **Status**: Accepted
- **Date**: 2026-07-20

## Context

Six large forms had grown four incompatible ways to submit:

| Form                   | Lines | Paradigm                            |
| ---------------------- | ----- | ----------------------------------- |
| `release-form`         | 615   | RHF `handleSubmit` + async mutation |
| `artist-form`          | 571   | RHF `handleSubmit` + async mutation |
| `video-form`           | 511   | RHF + `mutateAsync` + `router.push` |
| `profile-form`         | 478   | `useActionState`                    |
| `signup-signin-form`   | 462   | neither                             |
| `featured-artist-form` | 347   | manual `useState` + raw `fetch`     |

The duplication was literal, not thematic: `runArtistSubmit` and `runReleaseSubmit`
were the same function twice, down to the toast copy
_"Please refresh the page and try again, or check back later."_
character-for-character. Only the noun and the log prefix differed.

The scaffolding had also been hoisted out of the components into module-level
free functions taking a dependency bag, to stay under the ESLint complexity cap
of 10. `SubmitReleaseDeps` reached **nine** dependencies, including `router`.
That satisfied the cap by relocating complexity rather than concentrating it —
and because each bag was entity-shaped, the "shared" helpers ended up
re-implemented per entity anyway.

## Decision

**Entity forms share one submit protocol, `useEntitySubmit`.**
**`profile-form` keeps `useActionState`.**

`useEntitySubmit` owns only what every form does identically:

- guard a null form ref
- dispatch create-or-update on the presence of an id
- stop on failure with a message naming the entity and the verb
- run the entity's own success handling, then reset the form

Everything entity-specific — capturing a created id, flipping a published flag,
uploading pending images, routing — stays in the form, passed as a single
`onSuccess` callback.

## Rationale

**Why the hook is small.** The tempting version owns the whole submit, including
success toasts and navigation. That reproduces the problem: it grows a parameter
per entity until it is `SubmitReleaseDeps` again, wearing a hook's clothes. The
interface is kept to five members so it stays deep — a lot of shared protocol
behind a surface a caller can hold in their head.

**Why `profile-form` is exempt.** `useActionState` is the idiomatic Server Action
path and degrades without JavaScript. Forcing it onto the RHF protocol would
trade a real capability for uniformity. The two paradigms answer different
questions, so both are kept — deliberately, and recorded here so the difference
does not read as drift.

## Scope: which forms this covers

The protocol fits **reset-in-place** forms — those that stay on the page after a
successful write. That is `artist-form` and `release-form`, and it is the shape
new entity CRUD forms should reach for first.

It does **not** fit `video-form` or `featured-artist-form`, and they were
deliberately left alone after the fit was checked:

| Form                   | On success    | Failure handling                                    |
| ---------------------- | ------------- | --------------------------------------------------- |
| `artist-form`          | `reset`       | generic copy                                        |
| `release-form`         | `reset`       | generic copy                                        |
| `video-form`           | `router.push` | server message + `applyServerFieldErrors` per field |
| `featured-artist-form` | `router.push` | `buildCreateErrorMessage` / server `error` body     |

Both navigate away rather than resetting, so `reset` would be meaningless work.
More importantly both carry **richer failure handling than the protocol
exposes**: the hook ends a failed submit with one hardcoded toast and no callback
out, while `video-form` is the codebase's only caller of
`applyServerFieldErrors`, which maps server errors onto individual fields.
Converging it would trade field-level errors for uniformity.

`featured-artist-form` has a second blocker: its update path is a raw `fetch`
PATCH to `/api/featured-artists/[id]`, so there is no `update(id, values)` to
pass. Giving it a real update mutation is worth doing on its own merits — it is
the only entity form still calling an API route directly — but that is a
data-layer change, not a submit refactor, and it should not be smuggled in under
this ADR.

## Consequences

- New **reset-in-place** entity CRUD forms use `useEntitySubmit`. Failure copy
  and reset behaviour come for free and stay consistent.
- The `*Deps` interfaces and the per-entity `submitXCreate` / `submitXUpdate` /
  `runXSubmit` trios are deleted as each qualifying form migrates.
- `profile-form` will keep looking different from its neighbours. That is
  intended; see above before "fixing" it.
- `signup-signin-form` is out of scope — it is an auth flow, not entity CRUD.
- Four forms now submit three different ways. That is the accepted cost: the
  differences track real differences in what happens after the write, not drift.

## Alternatives considered

- **Converge all six, including `profile-form`.** Rejected: loses progressive
  enhancement for uniformity's sake.
- **Leave the forms alone.** Rejected: the two runners were byte-identical apart
  from a noun, and the dependency bags were growing.
- **A hook that owns success toasts and navigation too.** Rejected: it becomes a
  dependency bag again. See rationale.
- **Add an `onFailure` callback so `video-form` and `featured-artist-form` fit.**
  Rejected on the deletion test. With both outcomes delegated, the protocol would
  own only a null-ref guard and one ternary — and `video-form` reaches it through
  `form.handleSubmit`, so it has no form ref to guard. Deleting the hook would
  give that form back a single line of `id ? update(...) : create(...)`. That is
  a pass-through wearing a hook's clothes, which is the thing this ADR exists to
  avoid.
