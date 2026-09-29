# ADR-0016: An artist is public whether or not it is still on the label

- **Status**: Accepted
- **Date**: 2026-09-28
- **Supersedes**:
  [ADR-0011](0011-alumni-are-deactivated-artists-with-a-departure-date.md)

## Context

ADR-0011 gave the public artists index a Current / Alumni / All filter and
made "current or alumni" part of the rule that decides whether an artist is
public. An alumnus was an artist with `isActive: false` and a recorded
`deactivatedAt`. An inactive artist with no departure date was hidden from
every public surface.

Three things were true of that rule:

- No code writes `isActive`, `deactivatedAt` or `reactivatedAt`. There is no
  admin screen for any of them. An artist became an alumnus, or became hidden
  for being inactive, only when someone edited the row by hand or by script.
- The rule added a third way for an artist to be hidden, beside never being
  published and being archived. Every public read, every check of a release
  credit and every probe of a `where` on MongoDB had to carry it.
- It hid names. An inactive artist with no departure date dropped off the
  byline of every release that credits it, with nothing in the admin to show
  why or to put it back.

## Decision

**Whether an artist is still on the label plays no part in whether the artist
is public. A public artist is one that is published and not archived.**

- **`isActive` is not read.** An artist that left the label stays on the site
  like any other: on the index, on its own page, on the releases and tour
  dates that name it, and in every search.
- **The artists index is one list.** The Current / Alumni / All filter is
  removed, with its `roster` query parameter. A request that still sends
  `roster` is served the one list.
- **The fields stay in the schema.** `isActive`, `deactivatedAt`,
  `deactivatedBy`, `reactivatedAt` and `reactivatedBy` are kept on the
  `Artist` model and nothing reads them to decide what is public. Removing
  them is a schema change with no gain today.
- **Archiving is the one way to take an artist off the site.**

## Consequences

- An artist that was hidden only because it was inactive with no departure
  date becomes public when this ships, if it is published and not archived.
  Production is to be checked for such artists before the deploy; each one
  that must stay off the site is to be archived first.
- The home-page typeahead and the playlist "By artist" search now find an
  artist that left the label. They used to search current artists only.
- An artist card no longer needs to say whether the artist is current.
- The terms **current artist** and **alumni** leave the glossary.
- If the label later wants to show who is on the roster now, that is a new
  decision. It needs an admin screen that writes the fields first.

## Alternatives rejected

- **Hiding every inactive artist, as before ADR-0011.** It removes the filter
  too, but it takes an artist that left the label off every release that
  credits it. A release would again be public with a name missing.
- **Keeping the rule and removing only the filter.** The index would show
  current artists and alumni in one list, and an inactive artist with no
  departure date would still be hidden by a field no screen can set.
