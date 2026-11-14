# Community Submissions, Stage 5: Views and Trending — Design Spec

- **Date**: 2026-11-14
- **Branch**: `feat/community-views-trending` (off main `9df47d3e`, v4.487.0)
- **Status**: Implemented on the branch; see "As built" at the end
- **Vocabulary**: `CONTEXT.md` (view, submission row, listed submission,
  public submission, download subject)
- **Decisions**:
  [ADR-0029](../adr/0029-a-view-is-a-row-that-lives-as-long-as-it-counts.md),
  [ADR-0025](../adr/0025-a-submission-is-public-only-in-the-form-an-admin-approved.md),
  [ADR-0028](../adr/0028-a-submission-report-does-not-record-who-filed-it.md)
- **Earlier stages**:
  [stage 1](2026-11-11-community-submissions-stage-1-design.md),
  [stage 2](2026-11-11-community-submissions-stage-2-design.md),
  [stage 3](2026-11-12-community-submissions-stage-3-design.md),
  [stage 4](2026-11-13-community-submissions-stage-4-design.md)

## Problem

The community page leads with one submission row, Most Recent. The second,
Trending, was held back until views exist. This stage counts **views** and
adds the row. It is the last stage of the feature.

## Settled with the owner

Agreed on 2026-11-11:

| Question     | Answer                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| A view       | One viewer opening a submission's own page, at most once per viewer, per submission, per day. A card is not a view. |
| The viewer   | A signed-in viewer by account; a guest the way a guest download subject is.                                         |
| Never a view | The owner's and approvers' openings.                                                                                |
| Trending     | Views over the last thirty days, newer first on a tie. The second row, under Most Recent.                           |

On 2026-11-14 the owner asked for a recommendation on the two questions left
open and for the stage to start on it:

| Question                        | Recommendation built here                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| How views are stored            | One row per counted view, holding the submission, the time and a unique hash of submission, viewer and UTC day. No viewer is recorded. |
| How views are pruned            | An hourly check deletes rows older than thirty days: a row lives exactly as long as it counts.                                         |
| The minimum for Trending        | Five views in the last thirty days.                                                                                                    |
| How a guest's views are bounded | One address adds at most five guest views to one submission in 24 hours.                                                               |

The reasons, and what was rejected, are in ADR-0029.

## Design

### 1. Data model — `prisma/schema.prisma`

One new model, and its back-relation on `Submission`:

```prisma
model SubmissionViewEvent {
  id           String     @id @default(auto()) @map("_id") @db.ObjectId
  submissionId String     @db.ObjectId
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  viewKey      String     @unique
  viewedAt     DateTime   @default(now())

  @@index([submissionId])
  @@index([viewedAt])
}
```

- `viewKey` is the SHA-256, in hex, of `<submissionId>|<viewer>|<UTC day>`,
  where the viewer is `user:<account id>` or `guest:<visitor id>` and the
  day is `YYYY-MM-DD`. Its unique index is the once-a-day rule.
- Nothing on the row names the viewer.
- Additive: a new collection and three indexes. The deploy's `schema-push`
  job applies it (ADR-0012), and a one-step rollback stays safe (ADR-0021):
  the version before this one never reads the collection.
- `Submission` gains no field. A counter there would move `updatedAt` on
  every view, and an approver's decision is guarded by `updatedAt`.

### 2. Counting a view — `POST /api/community/submissions/<id>/view`

A route, not a Server Action: the guest's visitor cookie is scoped to
`/api`, the guest identity is resolved from a request, and a Server Action
that sets a cookie re-renders the page that called it.

In order:

1. **Rate limit**: its own tier, 10 requests a minute per address, the
   download routes' number. Past it, `429`.
2. **The id**: not an ObjectId is a `400`.
3. **Same site**: the request must say it came from this site
   (`Sec-Fetch-Site: same-origin`, or with that header absent, an `Origin`
   whose host is the request's own). Anything else is answered like a
   counted view and counts nothing.
4. **The viewer**: the session's user, or a guest. A banned account counts
   nothing.
5. **The service** decides and writes (below).
6. **The answer** is `204` with `Cache-Control: private, no-store`, whether
   or not a view was counted and whether or not the id names anything. A
   failure is logged and answered `500`.

`SubmissionViewEventService.record`:

1. Read the submission with its owner. Not a **public submission**: nothing.
2. The viewer is the owner, or an approver: nothing.
3. A signed-in viewer: write the row. A duplicate key means this viewer was
   already counted today; nothing more happens.
4. A guest: resolve the guest identity as a download does (the visitor
   cookie, else the fingerprint, else a new one, reissuing the cookie when
   asked). If today's key exists already, stop. Otherwise spend one of the
   address's five for this submission; when none is left, stop. Then write
   the row.

- The address key is the full IPv4 address, or an IPv6 address's `/64`. It
  is handed to the daily allowance and never stored.
- The allowance is skipped under `E2E_MODE`, as every other one is.
- The guest identity is resolved only for a public submission, so a request
  for anything else creates nothing.

### 3. The beacon — `SubmissionViewBeacon`

A client component on a submission's page that renders nothing and posts to
the route once, after it mounts.

- The page renders it only for a reader who can be counted: the submission
  is public and the reader is neither its owner nor an approver. The route
  enforces the same rule; this only saves the request.
- It sends `keepalive`, so a reader who leaves at once is still counted.
- A failed request is ignored. Nothing on the page depends on it.
- In development React mounts it twice; the second request is the same
  viewer on the same day and counts nothing.

### 4. Reading Trending

- **Repository** `SubmissionViewEventRepository`:
  - `record({ submissionId, viewKey, viewedAt })`: whether a row was
    written; `false` on a duplicate key.
  - `exists(viewKey)`.
  - `countsSince(cutoff, minimum)`: each submission with at least `minimum`
    rows since `cutoff`, with its count.
  - `deleteBefore(cutoff)`: how many rows were deleted.
- **Repository** `SubmissionRepository.listListedAmong(ids)`: the listed
  submissions among those ids, newest first by first approval, then by id.
  Built from `submissionWhere.listed`, with the same read model as
  `listListed`.
- **Service** `SubmissionService.listTrendingCards()`: the counts of the
  last thirty days at or over the minimum; the listed submissions among
  them; ordered by views, most first, keeping newest first within a tie; the
  first twelve, as cards.
- With no submission at the minimum, the answer is empty without a second
  read.

### 5. The community page

- `/community` reads Trending beside the first page. A failed read is logged
  and the row is left out; the page still renders.
- The row sits under Most Recent and above "View all user submitted
  content", headed "Trending", through the same `SubmissionRow`.
- An empty Trending renders nothing, as the row already does.
- A per-user page shows no rows, as before.
- A submission may be in both rows and in the full list.
- No view count is shown anywhere: not on a card, not on a submission's
  page, not to its owner.

### 6. Pruning

`startViewPruneMonitor`, started from `instrumentation.ts` beside the two
existing hourly checks, in production only and never under `E2E_MODE`.

- On start and every hour it deletes view events older than thirty days.
- A failed check is logged and the next one still runs. Instances that check
  in the same hour delete the same rows; no claim is needed.
- It logs a count when it deleted any.

### 7. Constants

| Name                                     | Value | Where                         |
| ---------------------------------------- | ----- | ----------------------------- |
| `VIEW_WINDOW_DAYS`                       | 30    | `constants/submissions.ts`    |
| `TRENDING_MINIMUM_VIEWS`                 | 5     | `constants/submissions.ts`    |
| `GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION` | 5     | `utils/submission-allowances` |
| `SUBMISSION_VIEW_LIMIT`                  | 10    | `config/rate-limit-tiers.ts`  |

### 8. Edge cases

- A submission is edited and approved again: its views stay; they are views
  of the same submission.
- A submission is rejected or its owner banned: it leaves Trending on the
  next read. Its views stay until they age out, and count again if it
  returns.
- An unlisted public submission's views are counted. It is in Trending only
  once its owner lists it.
- A submission is deleted: its views go with it.
- Two requests for the same viewer and submission arrive together: one row
  is written; the other meets the unique index.
- A viewer signs in between two openings on one day: counted once as a
  guest and once as the account.
- The route is called for an id that names nothing, or a submission that is
  not public: `204`, and nothing is written, not even a guest identity.

### 9. Acceptance criteria

1. A signed-out visitor who opens a public submission's page adds one view
   to it.
2. The same visitor opening it again the same UTC day adds none; on a later
   UTC day, one more.
3. A signed-in user who is neither the owner nor an approver adds one view
   a day, keyed on the account.
4. The owner's opening and an approver's opening add none, and their pages
   send no request.
5. A request for a submission that is not public, or for an id that names
   nothing, adds none and is answered as a counted one is.
6. A request that does not come from this site adds none.
7. A banned account adds none.
8. A sixth guest view of one submission from one address in 24 hours is not
   counted; a signed-in viewer from that address still is.
9. A stored view holds the submission, the time and the key, and nothing
   that names the viewer.
10. The route answers `204` with `no-store`, `400` for a malformed id and
    `429` past its limit.
11. Trending holds the listed submissions with at least five views in the
    last thirty days, most viewed first, newer first on a tie, at most
    twelve.
12. A view older than thirty days does not count toward Trending, whether
    or not it has been deleted yet.
13. An unlisted, unapproved or banned owner's submission is never in
    Trending, whatever its views.
14. `/community` shows Trending under Most Recent and above the "view all"
    link; with nothing at the minimum, no Trending row is rendered.
15. A per-user page shows no Trending row.
16. The hourly check deletes views older than thirty days and leaves the
    rest.
17. Deleting a submission deletes its views.
18. A failed Trending read leaves the row out and the page renders.

### 10. Testing (TDD, per repo rules)

- **Unit**: the view key; the address key; the service's `record` for each
  branch of section 2; the allowance; the route (statuses, the same-site
  rule, the headers, the banned account); the beacon; the page with and
  without Trending cards; `listTrendingCards` (order, tie, the cut at
  twelve, the empty answer); the prune monitor; `instrumentation`.
- **Contract, on Docker Mongo**: the view event repository (the unique key
  under two concurrent writes, `countsSince` with its minimum and cutoff,
  `deleteBefore`, the cascade from a deleted submission) and
  `listListedAmong` (only listed ones, the order).
- **E2E**, in `e2e/tests/community-submissions.spec.ts`, on the dev server
  and on a local production build, with no retries: a signed-out visitor
  opens a listed submission and one view is stored; the owner's opening
  stores none; with four more views seeded the submission is in the
  Trending row on `/community`.
- **A security review** of the branch: a public route that writes.
- **A code review** of the branch before it is reported as built.

### 11. Out of scope

- Showing a view count anywhere, to anyone.
- A Trending page, or more than twelve.
- Counting plays of an attachment, or time spent on a page.
- Pruning guest identities (`VisitorIdentity`), which this route creates as
  the download routes already do.
- A keyed hash for the view key (ADR-0029, Consequences).

## Decisions made while drafting, for the owner to confirm

- **The three numbers**: a minimum of five views for Trending, five guest
  views per address per submission per day, ten requests a minute to the
  route.
- **The UTC day** is the day of "once per day".
- **No view count is shown** (section 5).
- **An owner or approver who is signed out is counted** as any guest is;
  nothing can tell them apart.
- **Trending and Most Recent may show the same submission.**

## Implementation constraints (repo rules that will bite here)

- A new repository read is not committed until its contract case passes on
  Docker Mongo (`pnpm run test:db`).
- The schema is edited by hand, never with `prisma format`.
- The beacon is client code: the constants and paths it imports must not
  reach a `server-only` module.
- Rate limits and allowances are skipped under `E2E_MODE`, so no E2E case
  proves them.
- The proxy is not reloaded reliably by the dev server; nothing here changes
  it.

## As built (2026-11-14)

Stage 5 is implemented on `feat/community-views-trending`. Where the build
differs from the design above, the build is what the code does and this
section says why. No acceptance criterion was changed.

### Decisions made while building, not yet confirmed by the owner

- **The three numbers stand as drafted**: five views for Trending, five
  guest views per address per submission per day, ten requests a minute to
  the route. One consequence was not seen when they were chosen: the
  minimum equals what one address may add in a day, so one person who
  clears their cookies five times can put a listed submission in Trending
  alone (ADR-0029, Consequences).
- **A guest with no visitor cookie is recognised by fingerprint**, as a
  download's guest is. That is the settled rule, and it has a cost the
  settled wording does not show: two people with the same phone and
  language on one network are one guest, and their openings of one
  submission on one day count once. The code review recommends that a view
  identify a guest by the cookie alone and let the address bound do the
  rest. It was not changed, because it changes a rule the owner settled.
  It is the first thing to decide.
- **The view key is keyed with the server's signing secret**
  (`AUTH_SECRET`, as the Turnstile gate already reuses it). Section 11 put
  a keyed hash out of scope; the security review showed the plain hash
  could be rebuilt for every account, submission and day in about a minute.
- **Trending considers the hundred most viewed submissions**
  (`TRENDING_CANDIDATES`), then keeps the listed ones.
- **The route's limit** is its own tier, not the public one.

### Differences from the design

- **Section 1, the key.** An HMAC-SHA-256 under the signing secret, of
  `submission-view|<submission>|<viewer>|<UTC day>`. A view is refused, with
  nothing stored and no guest identified, when the server has no secret.
- **Section 2, the answer.** The status and body are the same for every
  well-formed request. One thing differs: a guest with no visitor cookie is
  sent one only when the id names a public submission, since a guest is
  identified only then. The submission's own page already answers `200` or
  `404` for the same question.
- **Section 2, the caller.** The route's handler was one branch over the
  linter's complexity cap; who is calling is worked out in a helper.
- **Section 3, the beacon.** One mount posts once, also in development.
  React replays a mounted effect there, and two requests at once from a
  guest with no cookie yet resolved to two visitors: one opening was
  counted under both. A ref outlives the replay. A real remount posts again
  and the server counts it once.
- **Section 4, the count.** `countsSince(cutoff, minimum, limit)` returns
  the most viewed first, the id breaking a tie, and no more than `limit`.
- **Section 4, the slim read.** Counting a view reads only whose the
  submission is and whether it is public (`findStanding`), never its
  content or its owner's email.
- **Section 7, the constants.** `GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION` is
  in a module of its own, `utils/submission-view-allowance.ts`: the
  existing allowances module holds what one owner may cost, keyed by
  account, and this is keyed by address. `TRENDING_CANDIDATES` (100) is new.
- **A duplicate key is told by name.** On the dev server a duplicate key
  reached the repository as a `DataError` that failed `instanceof`, and
  every repeat view answered `500`. The catch reads the name and the code
  (`isDataErrorWithCode`). The production build is not affected; that was
  measured (`docs/lessons/prisma-mongo/a-data-error-is-told-by-its-name.md`).
- **The E2E database gets one unique index.** Nothing pushes the schema
  there, so it holds none of the schema's unique indexes. The seed now
  creates the view key's, and a spec fails if it is missing.

### How it was checked

- **Unit**: the four-command gate passes on the finished tree. The counts
  are in the pull request, which reports what ran there.
- **Real database**: the contract suite on Docker Mongo. For views: a key
  is stored once and refused the second time; eight writers racing for one
  key store one row, and eight rows with the index dropped, which was run
  to prove the case can fail; the count reads from the cutoff's own
  instant, drops a submission under the minimum, orders by views and stops
  at its limit; the prune deletes exactly the rows before its cutoff;
  deleting a submission deletes its views. `listListedAmong` reads only the
  listed ones among the ids it is given, newest first.
- **End to end**, in `community-submissions.spec.ts`, on the dev server and
  on a local production build, with no retries: a signed-out visitor's
  opening stores one view and a reload stores none; the stored row holds
  four fields and a 64-character key; the owner's page sends no request,
  and neither the owner nor an approver is counted when the route is asked
  directly; another signed-in user is counted once in two requests; a
  cross-site request is answered `204` and counts nothing; five views put
  a listed submission in the Trending row, while six views from forty days
  ago and eight views on an unlisted submission do not; the headings read
  Most Recent, Trending, All submissions; one user's list shows no
  Trending row.
- **By eye**: `/community` with both rows at 1440 and 375 pixels wide.
- **Security review**: an independent read of the branch. It found no way
  for an unapproved, rejected, unlisted or banned owner's submission to
  reach Trending, found the same-site check sound for a browser, and found
  nothing that names a viewer stored with a view or logged by the route.
  Acted on: the unkeyed hash, the unbounded second read of Trending, and
  two statements that were not true (the address "lives in the limiter and
  nowhere else"; the answer "never says a submission is public").
- **Code review**: an independent read for defects. It found no blocking
  defect. Acted on: a beacon case that could not fail, a spec that copied
  the rule it depended on, an inaccurate comment, and an E2E case that
  would miscount across 00:00 UTC.

### Known gaps

- **Guest views are undercounted where like devices share a network**, and
  **one address can reach the Trending minimum alone**. Both are above.
- **The limits are not exercised end to end.** Rate limits and allowances
  are skipped under `E2E_MODE`.
- **A guest identity is created for any caller the route lets through.**
  One address can create up to ten a minute here, as it can through the
  free-download status route, which creates one for any well-formed id.
  The two limits add up. Nothing prunes `VisitorIdentity`.
- **The route's limit and nginx key on the full address; only the guest
  bound uses an IPv6 `/64`.** A caller with a whole `/64` is rate limited
  per address, not per network.
- **Two openings at one instant by one guest** spend two of the address's
  five and store one view.
- **When the rate limiter's store is down**, the guest bound is held in
  each server process's memory.
- **The Trending count is not cached** and reads every view of the last
  thirty days on each load of `/community`. No page on the site is rate
  limited by nginx.
- **The views test skips in the two minutes before 00:00 UTC**, since the
  key changes with the day.
- **No E2E covers the thirty-day prune.** It runs in production only; the
  service, the monitor and the repository's delete are covered by unit and
  contract specs.

### Found outside this stage

- **An IPv6 client may be able to choose its own address** (unproven; from
  the security review). nginx trusts `X-Forwarded-For` from
  `172.16.0.0/12`, the Docker bridge range. If the host accepts IPv6 and
  Docker carries it through its userland proxy, nginx sees the bridge as
  the peer and takes the client's own header as the address. That would
  defeat every per-address limit on the site, this stage's included.
  Whether the host has a public IPv6 address was not checked.
- **Twenty-four places test `instanceof DataError`.** On the dev server
  the check can miss and the code takes its generic failure path. The
  production build is not affected. None was changed.
- **Two free-download E2E specs race.** `free-download-cap.spec.ts` seeds a
  capped visitor with a made-up fingerprint; its first request rewrites
  that to the real Pixel 7 fingerprint. `free-digital-downloads.spec.ts`
  opens the same release with the same device and no cookie, is recognised
  as the capped visitor, and finds no format to pick. It failed 1 run in 8
  on the production build with this stage's spec left out of the run. It
  is the fingerprint rule above, seen between two specs.
- **`use-attachment-uploads.spec.ts` "leaves the other files alone when one
  of them fails"** failed once in a full unit run, at its one-second wait,
  and passed alone three times and in the next full run. Not investigated.
