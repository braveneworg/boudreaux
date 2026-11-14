# Community Submissions, Stage 4: The Community Page — Design Spec

- **Date**: 2026-11-13
- **Branch**: `feat/community-page` (off main `39625ef1`, v4.485.0)
- **Status**: Implemented on the branch; see "As built" at the end
- **Vocabulary**: `CONTEXT.md` (listed submission, community page, submission
  row, public submission, card picture, about)
- **Decisions**:
  [ADR-0025](../adr/0025-a-submission-is-public-only-in-the-form-an-admin-approved.md),
  [ADR-0027](../adr/0027-an-attachment-reaches-the-cdn-only-while-its-submission-is-approved.md),
  [ADR-0028](../adr/0028-a-submission-report-does-not-record-who-filed-it.md)
- **Earlier stages**:
  [stage 1](2026-11-11-community-submissions-stage-1-design.md),
  [stage 2](2026-11-11-community-submissions-stage-2-design.md),
  [stage 3](2026-11-12-community-submissions-stage-3-design.md)

## Problem

Stages 1 to 3 built the approval loop, attachments and reports, and kept all
of it behind an approver-only gate. Nobody else can submit, and no page
lists what was approved. Stage 4 is the launch: it opens the feature to
every user, adds the **community page** with its search, its Most Recent
**submission row** and the full list, and puts "Community" in the menu.

Opening the gate also makes two things public for the first time: a
**public submission**'s own page for a signed-out visitor, and the
anonymous path of the stage 3 report action.

## Settled with the owner

Agreed on 2026-11-11, recorded until now in no repo file:

| Question      | Answer                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu entry    | "Community", a top-level link between the Label group and My Collection. The page's heading stays "User Submitted Content".                                                                             |
| Addresses     | `/community`; `/community/<id>` and `/community/submit` (built); `/community?user=<username>` for one user's listed submissions, a filter on the page and not a page of its own.                        |
| Page order    | Search, then the heading and a short description with a link button to the form, then Most Recent, then Trending (stage 5), then the full list.                                                         |
| Search        | A combobox like the site's others. It reads the title, the about and the username, never the writing. A result shows the user's avatar, username and the title. An empty result reads "No results yet." |
| Rows          | At most twelve listed submissions, four-up, looping in both directions. A fixed set, never fetched endlessly. An empty row is not rendered. A submission may be in a row and in the full list.          |
| A card        | The user's avatar over the card picture; below it the title, linked to the submission's page; below that the username, linked to the per-user filter.                                                   |
| View all      | Under the rows, a "View all user submitted content" link scrolls to the full list and respects the visitor's motion preference.                                                                         |
| The full list | Every listed submission, newest first, with infinite vertical scroll.                                                                                                                                   |
| The gate      | Stage 4 lifts it, which also opens the anonymous report path.                                                                                                                                           |
| A rename      | The per-user filter uses the current username and breaks on a rename. A submission's own link never holds the username.                                                                                 |

Answered on 2026-11-13:

| Question                    | Answer                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The short description       | "Videos, songs, photos and writing from the Fake Four Inc. community. Everything here was sent in by a fan and approved by our team." |
| A card without a username   | "A community member", not linked. The avatar still shows. Only an account older than generated usernames can lack one.                |
| Where the avatar sits       | Laid over the picture's bottom-left corner.                                                                                           |
| Stage 3's six build choices | All kept, ADR-0028 among them.                                                                                                        |
| The production smoke        | Done: a photo and a short video both re-encoded on production.                                                                        |

## Design

### 1. Opening the gate

- `mayUseCommunity` in `src/lib/community/community-access.ts` answers yes
  for every role and for a signed-out visitor. Nothing else moves; each
  caller was read with that answer in mind:

  | Caller                                    | After launch                                                                                                               |
  | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
  | `communityViewer` (a submission's page)   | A signed-out visitor is a reader like any other and sees what the public rule allows. A banned account is still refused.   |
  | `requireCommunityUser` (form, owner list) | Still needs a signed-in user: a signed-out visitor is sent to sign in and brought back. A banned account is still refused. |
  | `communityClosedRefusal` (every action)   | Never refuses. Each action's own gate (`signed-in`, `approver`) is what stands.                                            |
  | `fileSubmissionReportAction`              | Open to anyone, with or without an account. A banned account is still refused.                                             |
  | The attachments list route                | Unchanged: it serves the owner and approvers only, by its own check.                                                       |

- The module stays, as the one place to close the feature again. Its
  answer no longer reads the role.

### 2. Data model — `prisma/schema.prisma`

One additive, optional field on `Submission`:

```prisma
aboutText String? // the about as plain text; what search reads
```

- The about is stored as sanitized HTML. A `contains` on the HTML would
  match tag names ("em", "strong") and miss a phrase that crosses a bold
  boundary, so search reads a plain-text copy.
- The service writes it on every save, from the sanitized HTML, in the one
  place content is sanitized.
- It is optional because a required field that existing documents lack
  fails to read on MongoDB. A submission saved before this stage has none,
  and its about is not searched until its next save; its title and username
  are. Production holds only approvers' test submissions from before launch.
- No new index. `@@index([status, listed, firstApprovedAt])` from stage 1
  already serves the list and the row.

### 3. Fragments and reads

- **Fragments** in `src/lib/repositories/_internal/submission-where.ts`:
  - `listed`: a public submission whose owner chose to show it
    (`public` and `listed: true`).
  - `matching(term)`: the title, the about text or the owner's username
    contains the term, case-insensitively.
  - Proved by the contract spec beside it, with rows for a banned owner, an
    unlisted and an unapproved submission, an absent `aboutText`, and a
    search term. `listed` and `matching` both filter the `owner` relation, the shape
    `docs/lessons/prisma-mongo/same-relation-filters-share-one-join.md`
    warns about, so the case with a term is the one that matters. If it
    fails on MongoDB, the username match becomes a lookup of owner ids
    first.
- **Repository** `SubmissionRepository`:
  - `listListed({ skip, take, search?, ownerId? })`: listed submissions,
    newest first by `firstApprovedAt`, then by id. A read model
    `ListedSubmissionRecord` (id, title, category, owner username and
    email) bound to its `select` by a drift guard.
  - `isPublic(id)`: whether an id names a public submission.
- **Service** `SubmissionService`:
  - `listCards(query)`: `SubmissionCard[]`, each with its card picture's
    CDN address or none, the owner's username or none, and the owner's
    avatar hash. The owner's email never leaves the server.
  - `isPublic(id)`.
- Most Recent is `listCards` with no search, no owner and twelve rows. It
  is the same order as the full list, by the owner's decision that a
  submission may be in both.

### 4. The listing route — `GET /api/community/submissions`

Public, behind `withRateLimit(publicLimiter, PUBLIC_LIMIT)` like
`/api/videos`. nginx already budgets every `/api/` path (ADR-0013); no
nginx change.

| Param    | Rule                                                        |
| -------- | ----------------------------------------------------------- |
| `skip`   | Integer from 0. Default 0.                                  |
| `take`   | Integer from 1 to 24. Default 12.                           |
| `search` | Trimmed, at most 100 characters. Empty means no search.     |
| `user`   | A username, at most 100 characters. Empty means every user. |

- Validated by a Zod schema in
  `src/lib/validation/submission-listing-schema.ts`; a bad value is a 400.
- Answers `{ rows: SubmissionCard[], nextSkip }`. A `user` that names no
  account answers an empty page.
- Sent `Cache-Control: private, no-store`: a rejected submission must leave
  the listing on the next read.
- Only listed submissions are ever in the answer, whoever asks. An
  approver or an owner gets no more here than a stranger.

### 5. The community page — `src/app/community/page.tsx`

A Server Component. In order:

1. **Search** (section 6).
2. **Heading** "User Submitted Content" (`h1`), the short description, and
   a "Submit something" link button to `/community/submit`. A signed-in
   visitor also gets a "Your submissions" link to `/community/mine`.
3. **Most Recent** (section 7), when it holds anything.
4. Trending's place (stage 5). Nothing is rendered for it now.
5. **"View all user submitted content"**, when a row is shown: a link to
   `#all-submissions`. It is a real fragment link, so it works before the
   page hydrates; once hydrated it scrolls smoothly, or jumps when the
   visitor prefers reduced motion.
6. **The full list** (section 8), under an `h2` "All submissions" with the
   id the link names.

With nothing listed at all, the page shows the search, the heading block and
"Nothing here yet. Be the first to submit something."

**The per-user filter**, `/community?user=<username>`:

- The username is matched exactly, as stored. A username that names no
  account is the not-found page, as an unknown `/videos?artist=` is.
- The rows and the "view all" link are not shown. The list's heading is
  "Submissions by <username>", with a link "View everyone's submissions"
  back to `/community`.
- A user with nothing listed (or a banned one, whose submissions are not
  public) shows "Nothing listed yet." under the heading.
- The page's title is "Submissions by <username>".

Metadata: title "User Submitted Content", the short description as the
description. The page may be indexed. No sitemap or robots file exists in
this app and none is added.

### 6. Search

A combobox built from the shared pieces (`SearchComboboxTrigger`,
`SearchResultRow`, `Command` with its own filtering off), like
`VideoSearchCombobox`.

- Typing queries the listing route, debounced, for the eight best matches,
  newest first. Before anything is typed it suggests the eight newest.
- A result shows the owner's avatar, the title, and the username (or "A
  community member") beneath it.
- Choosing a result opens that submission's page.
- It always searches every listed submission, also on a per-user page.
- It does not filter the list beneath it: the list is two sections down,
  and filtering something off screen says nothing to the person typing.
- While a query is in flight it reads "Searching…"; with no match, "No
  results yet."

### 7. A card, and the Most Recent row

**A card** (`SubmissionCard`), used by the row and the list:

- The **card picture**, square, cropped to fill; without one, a tile naming
  the category (the wording `SubmissionCardPicture` already uses).
- The owner's avatar over the picture's bottom-left corner. Decorative: the
  username beneath names the owner, so the avatar has empty alt text.
- The title, at most two lines, linked to `/community/<id>`. An empty title
  reads "Untitled".
- The username, linked to `/community?user=<username>`; or "A community
  member", not linked.
- The picture is also a link to the submission, kept out of the tab order
  and the accessibility tree so a card is one stop, not two.

**The row** (`SubmissionRow`): a heading (`h2`, "Most Recent") over the
shared `Carousel`, up to twelve cards.

- Four cards across from the `lg` breakpoint, three from `md`, two below.
- Previous and next buttons; the left and right arrow keys move it when it
  has focus, as the shared carousel already does.
- It loops in both directions when it holds more than four cards. With four
  or fewer there is nothing to loop.
- The cards are rendered on the server; the twelve are in the page's HTML.
- With reduced motion preferred, a move is a jump, not a slide.
- The component takes its heading and its cards, so stage 5's Trending is a
  second use of it.

### 8. The full list

A client island (`CommunityList`) under the heading:

- A grid of cards: two across, three from `md`, four from `lg`.
- Pages of twelve from the listing route through a TanStack infinite query
  (`useInfiniteListedSubmissionsQuery`), fetched as a sentinel under the
  grid nears the viewport (`useInfiniteScroll`).
- The first page is prefetched on the server and hydrated, read from the
  service and not by a request to the app's own route, as `/videos` does.
- A failed read shows "Unable to load submissions." with a "Try again"
  button.

### 9. The menu

- `useNavMenuItems` gains "Community" (`/community`), for everyone.
- `useNavMenuGroups` places it after the Label group and before My
  Collection. The desktop menu and the mobile sheet both read that hook.
- Its colour is `menu-item-green-300`, a shade no entry uses yet.

### 10. Finding the way back

- Every community page's breadcrumbs start at "Community" (`/community`):
  a submission's page, the form, the edit page and the owner's list.
- On a submission's page the owner's username links to their per-user
  filter. "A community member" stays plain text.

### 11. A real 404 for `/community/<id>`

The page sits under the root `loading.tsx`, so its `notFound()` renders the
not-found page under a `200`
(`docs/lessons/react-nextjs/a-real-status-under-a-loading-boundary-comes-from-the-proxy.md`).
With the public and search engines now reaching these addresses, the status
has to be real.

- `src/proxy.ts` matches `/community/:id` and decides before any auth gate,
  as it does for the legacy release address. `/community/submit` and
  `/community/mine` are not ids and go on to their pages.
- **A request with no session cookie** for an id that is not a public
  submission (unapproved, a banned owner's, deleted, never existed, or not
  an id) is rewritten in place under a `404`. The page then renders the
  not-found page with that status.
- **A request with a session cookie** always goes on to the page, which
  decides for that reader as it does today. A signed-in reader refused
  there still gets the not-found page under a `200`.
- That split is deliberate. The proxy could only answer a signed-in reader
  with a real `404` by learning who they are; and answering `404` for "no
  such submission" but `200` for "exists, not yours" would tell a signed-in
  prober which ids exist. As built, the two cases are the same to a
  signed-out reader (`404`) and the same to a signed-in one (`200`).
- The proxy's work is one read, `SubmissionService.isPublic`, on that path
  only.

### 12. Edge cases

- A submission is rejected while it is in someone's loaded row or list: it
  stays on their screen until the next read, and its link is not found.
- The owner unlists one: it leaves the page, the search and the per-user
  filter on the next read; its link still opens.
- The owner is banned: all of theirs leave on the next read.
- A username holds characters that need encoding: the per-user link encodes
  it, and the page decodes it once.
- Two submissions share a first-approval instant: the id breaks the tie, so
  paging never repeats or drops one.
- A new submission is approved while a visitor pages the list: later pages
  shift by one and a card can repeat. The list drops a repeated id.
- JavaScript is off or slow: the heading, the row's twelve cards, the first
  page of the list and the "view all" link are all in the server's HTML and
  every link in them works.

### 13. Acceptance criteria

1. A signed-out visitor opens an approved submission's page, listed or
   unlisted, and sees it with its share row and its Report control.
2. A signed-out visitor files a report from that page; one report is
   stored, with nothing that identifies who filed it.
3. A signed-in user who is not an approver can open the form, save a draft,
   publish it, and see it in their own list.
4. A signed-out visitor who opens `/community/submit` or `/community/mine`
   is sent to sign in and brought back.
5. A banned account is refused every community page and every submission
   action, the report action included.
6. `/community` shows, in order: the search, the heading "User Submitted
   Content", the agreed description, a "Submit something" link, the Most
   Recent row, the "view all" link and the full list.
7. The page lists only listed submissions: an unlisted one, an unapproved
   one and a banned owner's are in no row, no list page and no search
   result, for any reader.
8. Most Recent holds at most twelve cards, newest first by first approval.
   A re-approval after an edit does not move a submission.
9. With nothing listed, no row and no "view all" link are rendered and the
   page says nothing is here yet.
10. The row loops in both directions when it holds more than four cards,
    and its buttons and the arrow keys move it.
11. A card shows the card picture (or the category tile), the owner's
    avatar on the picture's corner, the title linked to the submission and
    the username linked to the per-user filter.
12. A card whose owner has no username reads "A community member" with no
    link.
13. The full list holds every listed submission, newest first, twelve to a
    page, and loads the next page as the visitor nears its end. No card
    appears twice.
14. "View all user submitted content" moves to the full list; with reduced
    motion preferred it does not animate.
15. The search finds a listed submission by a word in its title, in its
    about, or in its owner's username, whatever the case; it never matches
    on the writing or on markup.
16. A search result shows the avatar, the title and the username, and
    choosing it opens the submission's page.
17. A search with no match reads "No results yet."
18. `/community?user=<username>` lists exactly that user's listed
    submissions under "Submissions by <username>", with a link back to
    everyone's; a username that names no account is not found.
19. The listing route refuses a `take` over 24, a negative `skip` and a
    `search` over 100 characters with a 400, and is rate limited.
20. "Community" is in the desktop menu and the mobile menu, between the
    Label group and My Collection, for signed-in and signed-out visitors.
21. A signed-out request for `/community/<id>` answers `404` when the id is
    not a public submission and `200` when it is. The not-found page is the
    themed one.
22. A signed-in request for `/community/<id>` is never answered by the
    proxy.
23. Saving a submission stores its about as plain text beside the HTML.
24. An unlisted public submission's page still sends `noindex`; a listed
    one's does not.
25. Every community page's breadcrumbs lead back to `/community`.

### 14. Testing (TDD, per repo rules)

- **Unit**: the access module's new answer and each caller's specs
  (`community-session`, the action helpers, the report action without its
  mock of the gate); the service's `listCards`, `isPublic` and the
  plain-text copy on save; the listing schema; the route; the hooks; each
  component; the nav hooks; `src/proxy.spec.ts` for the four cases of
  section 11 and a path that only shares the prefix.
- **Contract, on Docker Mongo**: `listed` and `matching` (section 3); the
  repository's `listListed` for its order, its tie-break, paging, the owner
  filter and a search term together with the owner filter.
- **E2E**, in `e2e/tests/community-submissions.spec.ts`, on the dev server
  and on a local production build, with no retries:
  - the existing cases change with the launch: the owner becomes a plain
    signed-in user, and "nobody the feature is not open to can open its
    link" becomes "nobody but its owner and approvers can open it before
    approval";
  - a signed-out visitor opens an approved submission and files a report
    (criteria 1 and 2), which stage 3 left for this stage;
  - the community page: a listed submission appears in Most Recent and the
    full list, an unlisted one in neither; search finds it by its about;
    the per-user filter lists it; "Community" is in the menu;
  - the status of `/community/<id>` signed out, for a public id and for one
    that is not (criterion 21), read from the response.
- **A security review** of the branch once the gate is open: every
  `/community/*` read and the report action are public for the first time.
- **A code review** of the branch before it is reported as built.

### 15. Out of scope

- Views and Trending (stage 5).
- A sitemap or a robots file.
- Sorting or filtering the list by category.
- A count of submissions beside the search.
- A real `404` for an unknown `/community?user=`: it is the themed
  not-found page under a `200`, as an unknown `/videos?artist=` is.
- Backfilling `aboutText` onto submissions saved before this stage.
- The gaps stage 2 recorded that launch does not change: a deleted
  account's files (the app has no path that deletes an account), the copy a
  late re-encode can leave in the private bucket, and timing a ten-minute
  video on AWS.

## Decisions made while drafting, for the owner to confirm

- **Search does not filter the list.** It is a jump to one submission
  (section 6). `/videos` filters its list as the visitor types; there the
  list is directly under the search.
- **A per-user page drops the rows** and shows that user's list alone
  (section 5).
- **A signed-in reader's refusal stays a `200`** with the not-found page;
  only a signed-out one gets the real `404` (section 11).
- **`aboutText` is not backfilled** (section 2).
- **The access module stays** as a switch that now answers yes
  (section 1), where it could have been deleted with its callers' checks.
- **A "Your submissions" link** for a signed-in visitor, beside "Submit
  something" (section 5). Nothing else on the site leads to
  `/community/mine`.
- **The username on a submission's page becomes a link** to the per-user
  filter (section 10).

## Implementation constraints (repo rules that will bite here)

- A new `where` is not committed until its contract case passes on Docker
  Mongo (`pnpm run test:db`).
- The listing schema and the card type are imported by client hooks and
  components, so neither may import a `server-only` module
  (`docs/lessons/react-nextjs/client-reachable-modules-must-not-import-server-only.md`).
- The proxy is not reloaded reliably by the dev server; restart it before
  probing section 11.
- A card picture is a single stored file with no width variants: render it
  through `resolveCdnImageSource`
  (`docs/lessons/react-nextjs/video-posters-have-no-image-variants.md`).
- The schema change is additive and optional, so the deploy's `schema-push`
  job applies it (ADR-0012) and a one-step rollback stays safe (ADR-0021).
- Rate limits are skipped under `E2E_MODE`, so no E2E case proves them.

## As built (2026-11-13)

Stage 4 is implemented on `feat/community-page`. Where the build differs
from the design above, the build is what the code does and this section says
why. Acceptance criterion 24 was wrong as written and is corrected below;
the others were not changed.

### Decisions made while building, not yet confirmed by the owner

- **The gate was removed, not left as a switch** (section 1). Left in place
  as a function that always answers yes, each caller's refusal branch could
  only be reached by mocking it, and the specs for those branches would have
  tested the mock. `community-access.ts` and every check on it are gone.
  Closing the community again is a revert of the commit "open the community
  to all"; there is no switch short of a deploy.
- **Two daily allowances per account**, added after the security review
  (below). Approvers are emailed and texted about at most **5** of one
  owner's submissions entering the queue in 24 hours; past that a publish
  still succeeds and the submission is in the queue. One account may upload
  at most **100** files in 24 hours. Both numbers are mine.
- **The anonymous report action counts attempts by address**: 10 a minute,
  before anything is verified. Also mine.
- **The menu entry's colour** is `menu-item-pink-200`, not the green of
  section 9: green would have sat beside My Collection's green.
- **The search offers no rows while a term is being typed or fetched**
  (section 6 said only that it reads "Searching…"). Rows appear once they
  answer what is typed.
- **A card's submission link is not prefetched.** Every prefetch of a
  submission's page is a database read in the proxy, and a page shows a
  dozen cards at a time.
- The seven "decisions made while drafting" above stand as built, except
  the access module, covered by the first point here.

### Differences from the design

- **Section 2, the plain-text about.** As designed. One consequence the
  design understated: an _approved_ submission saved before this stage gets
  its `aboutText` only from a content edit, which sends it back for
  approval. A save that changes nothing writes nothing.
- **Section 3, the search term.** `matching` escapes the term. On MongoDB
  most text filters are run as a regular expression and Prisma does not
  escape the value: unescaped, `.*` matched every row and `(` failed the
  query (`docs/lessons/prisma-mongo/a-text-filter-is-a-regex.md`).
  The escape is `containsText` in the where kit. Every other search on the
  site had the same defect and is fixed on this branch too; see "Found
  outside this stage".
- **Section 3, the two owner filters.** `listed` and `matching` both filter
  the `owner` relation and work together on MongoDB as written; the
  fallback to a lookup of owner ids was not needed.
- **Section 5, an empty page.** With nothing listed, the row, the "view all"
  link and the "All submissions" heading are all left out, so the empty
  message does not sit under a heading.
- **Section 5, the per-user heading.** The username is set in the body
  face inside the heading. The cutout face has no digits and prints
  capitals only; a username is neither.
- **Section 5, a `?user=` value longer than a username can be** names no
  account and is not found, without a lookup.
- **Section 7, the row's readiness.** The row says when its carousel has
  started (`data-ready`), which is later than hydration: a press before
  then does nothing.
- **Section 7, the row's width.** The row is 8px wider than its cards on
  each side and each card is inset by as much, so the clipped track leaves
  room for a card's shadow, hover growth and focus ring at both ends.
- **Section 7, the avatar.** Decorative avatars are hidden from assistive
  technology whole. With only an empty alt, the fallback "?" was read out
  until the image loaded.
- **Section 8, a failed later page.** The list stops loading on scroll,
  says "Unable to load more submissions." and offers "Try again". Left as
  designed it asked for the failed page again for as long as the end of the
  list stayed in view.
- **Section 10 and the actions.** Every write that can change whether a
  submission is listed also revalidates `/community`.
- **Section 11, a failed lookup in the proxy** goes on to the page, so the
  proxy cannot take a public page down. A spec reads
  `src/app/community/` and fails if a static one-segment page there is not
  let through for a signed-out visitor.
- **Criterion 24, corrected.** It said a listed submission's page sends no
  `noindex`. The page sets none of its own, but the root layout sets
  `noindex, nofollow` for the whole site, and a page that sets no `robots`
  inherits it. Every page on the site is served `noindex` today, a listed
  submission's included
  (`docs/lessons/react-nextjs/a-page-inherits-the-root-layouts-robots.md`).
  Stage 1's "a listed public one may be indexed" was never true of the
  rendered page.

### How it was checked

- **Unit**: the four-command gate passes on the finished tree; the test
  count and coverage are in the pull request, which reports what ran there.
  The coverage check passes above the 95% branch floor.
- **Real database**: the contract suite on Docker Mongo, with two new or
  extended files. The fragments: `listed`, `matching`, the two together
  with a banned owner whose username matches, an absent and a null
  `aboutText`, and four terms made of pattern syntax. The repository read:
  its order, its tie-break by id, paging without a repeat or a gap, the
  owner filter with a search term, and `isPublic` for each state.
- **End to end**, in `community-submissions.spec.ts`, on the dev server and
  on a local production build, with no retries:
  - the approval loop with a plain user as owner; a signed-out visitor is
    answered `404` before approval, `200` after it, and `404` again after
    an edit, each read from the response;
  - a signed-out visitor files a report; the stored row holds nothing about
    who filed it;
  - the community page for a signed-out visitor: the menu entry, Most
    Recent, the full list arriving with the page (no request to the listing
    route), the row moving with its buttons and an arrow key and wrapping
    at its start, "view all", the search finding a listed submission by a
    word of its about and offering neither a listed one without the word
    nor an unlisted one with it, the per-user list, an unknown username,
    and the form sending a signed-out visitor to sign in.
- **By eye**: the page at 1440, 768 and 375 pixels wide, the search open,
  the per-user list, and the row's first and last visible cards hovered and
  focused.
- **Security review**: an independent read of the branch with the gate
  open. It found no way for an unapproved, rejected, unlisted or
  banned-owner submission, or an owner's email, to reach anyone but its
  owner and approvers. It found what the removed gate had been holding
  back: nothing limited how often one account could notify every approver
  or run a re-encode, and the report action had no limit ahead of its
  verification call. The two allowances and the attempt limit above are the
  answer. It also asked whether the search term was escaped, which is how
  the regular-expression defect was found.
- **Code review**: an independent read for defects. Fixed from it: the
  search could open the newest submission when Enter was pressed before a
  typed term's results arrived; the failed-page loop; the clipped card at
  the row's right edge; the avatar's fallback; the unbounded `?user=`; a
  `500` from the listing route without `no-store`; and an E2E step that
  could pass with the about search broken.

### Known gaps

- **The site is not indexed, on purpose.** The root layout's
  `noindex, nofollow` stays as it is: the owner confirmed it on 2026-11-13.
  See criterion 24.
- **A signed-in reader's refusal is still a `200`** with the not-found page
  (section 11), by design.
- **An unlisted submission is protected by its id being hard to guess, and
  the proxy answers `200` or `404` for an id without a rate limit.** Ids
  are MongoDB ObjectIds: a timestamp, a per-process value and a counter,
  and every listed card publishes one. The security review rated guessing
  an unlisted approved submission's id low to medium and did not measure
  it. nginx sets no request limit on page paths.
- **The limits on an anonymous reporter can be stepped around** by changing
  the browser's user agent, which is part of the visitor fingerprint. What
  still binds: one verification per report, 50 open reports per submission,
  3 notices per submission per day, and now 10 attempts a minute per
  address. ADR-0028 chose not to trace reporters.
- **A card carries a hash of its owner's email** (the avatar's address).
  Anyone can test a guessed address against a username. That is how
  Gravatar works and was already true of a submission's page; the listing
  makes it possible in bulk.
- **The page's own reads are not rate limited**, as no page on this site
  is. The listing route is.
- **An attachment can land on a submission in the instant it is approved**
  and stay there without sending it back for approval. The window is one
  storage check wide and was in stage 2; its file is never published.
- **Rate limits and allowances are not exercised end to end.** They are
  skipped under `E2E_MODE`.
- **No E2E covers a second page of the list**: twelve cards are the first
  page, and the run seeds fewer. Paging is proved by the contract spec and
  the list's component spec.
- **The gaps of stages 1 to 3 that launch does not change** still stand: a
  deleted account's files, the copy a late re-encode can leave behind, and
  timing a ten-minute video on AWS.

### Found outside this stage

- **Every other search on the site ran its term as a regular expression.**
  Fixed on this branch, at the owner's request (2026-11-13). A probe on
  Docker Mongo showed the defect was wider than a case-insensitive
  `contains`: `startsWith` and `endsWith` in either mode, and `equals` and
  `in` when case-insensitive, are all run as patterns. Typing `(` into any
  search failed the query, and a duplicate check by name could match a
  different record (`a.c` matched "abc").
  - The where kit gained `startsWithText`, `equalsText` and `inTexts` beside
    `containsText`. All twelve repositories that wrote a text filter by hand
    now build it from them: releases, videos, artists, featured artists,
    tours, venues, producers, playlists, banner notifications, abuse
    reports, digital format files and the username lookups.
  - `text-filter-seam.spec.ts` scans every repository and fails on a text
    filter written by hand, so a new search cannot bring it back.
  - On Docker Mongo, `where-kit.contract.spec.ts` proves each helper and
    `text-search.contract.spec.ts` calls the real reads (videos, releases,
    the home page's artist search, tours, playlists, producers, usernames
    and the name lookups) with seven terms made of pattern syntax. With the
    escape removed, 34 of the 59 cases fail; with it, none.
- **A hydration mismatch on `/collection`** appears now and then in the dev
  server's log during the collection spec: a purchase's title differs
  between the server render and the client. The spec passes. Not
  investigated.
