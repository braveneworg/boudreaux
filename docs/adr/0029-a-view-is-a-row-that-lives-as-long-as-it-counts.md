# ADR-0029: A view is a row that lives as long as it counts

- **Status**: Accepted
- **Date**: 2026-11-14

## Context

The community page's second submission row, Trending, orders listed
submissions by their views over the last thirty days. A view is one viewer
opening a submission's own page, counted at most once per viewer, per
submission, per day; the viewer is a signed-in user or a guest. Those rules
were settled on 2026-11-11. Where a view is kept, when it is deleted and how
Trending reads it were left open.

Three facts about this codebase shaped the answer:

- An approver's decision is written only while the submission's `updatedAt`
  is still the one the approver loaded, and Prisma moves `updatedAt` on
  every update. A view counter on the submission would move it on every
  view, and an approval of a popular submission would fail as stale.
- A submission's page is rendered for link previews and crawlers as well as
  for people, and the guest's visitor cookie is sent only to `/api`.
- ADR-0028 keeps who filed a report out of the database. A table of who
  looked at what is the same kind of liability.

## Decision

**A counted view is one row in its own collection, kept for thirty days and
then deleted. Trending counts the rows on read. Nothing else holds a view
count.**

- **The row holds the submission, the time and one unique key.** The key is
  an HMAC-SHA-256 of the submission, the viewer and the UTC day, under the
  server's signing secret. The unique index on it is what makes a second
  opening on the same day not count, also when two requests arrive together.
- **The row does not hold the viewer.** No account id, no visitor id, no
  address and no fingerprint is stored on it. Every input to the key but the
  secret sits in the database, so a plain hash could be rebuilt for every
  account, submission and day in about a minute; the secret is what makes
  the row say nothing to someone who holds only the database.
- **A view is counted by the page in the browser, not by the render.** The
  page posts to a rate-limited route once it has mounted. A link preview, a
  crawler or a prefetch renders the page and counts nothing.
- **The route counts only what a reader of this site sent.** A request
  another site made a browser send is ignored.
- **A guest's views are bounded per address.** One address adds at most five
  guest views to one submission in 24 hours. The address is never stored
  with a view. The rate limiter holds it, with the submission's id, for up
  to two days; the web server's access log records the request as it
  records every page.
- **Trending is read in two steps.** Count the rows of the last thirty days
  by submission, keep those at or over the minimum, and take the hundred
  most viewed; then load those ids through the `listed` fragment. An
  unlisted, unapproved or banned owner's submission cannot reach the row
  whatever its count.
- **A row is deleted when it stops counting.** An hourly check deletes rows
  older than thirty days. If it never ran, Trending would still be right,
  because the read applies the same thirty days; only storage would grow.
- **A submission needs five views in the window to be in Trending.**

## Alternatives rejected

- **A counter on the submission.** One indexed read for Trending, but every
  view would move `updatedAt` and fail approvals in flight, and the counter
  would need a second job to take old views back out.
- **A counter in its own collection, kept true by a recount.** It keeps the
  read cheap at any size. It also adds a number that can be wrong and a job
  whose failure shows up as a stale Trending row. Not worth it until the
  rows are too many to count on read.
- **The once-a-day rule in Redis, with daily totals in MongoDB.** Nothing
  about a viewer would reach the database at all. The count would then
  depend on a free-tier Redis that has been deleted once already; when it is
  down, every reload would count.
- **A TTL index instead of the hourly check.** MongoDB would delete the rows
  itself, but the Prisma schema cannot declare one, so it would be an index
  made by hand on each database and invisible to the deploy.
- **Counting at render.** No route and no script, and every link preview and
  crawler would be a view.
- **Storing the viewer.** It would allow a "who viewed this" feature nobody
  asked for, and a breach would publish a month of every account's reading.

## Consequences

- Someone who holds the database and the signing secret can rebuild who
  viewed what for the last thirty days. Someone who holds only the database
  cannot.
- Rotating the signing secret changes every key from then on. A viewer
  already counted that day can be counted once more; nothing else changes.
- A guest is identified as a download's guest is, and that includes being
  recognised by fingerprint when they hold no visitor cookie: the browser,
  its language and the address's network. Two people with the same phone
  and language on one network, neither with a cookie yet, are one guest,
  and the second is given the first's cookie. Their openings of one
  submission on one day count once. Most first-time readers hold no cookie,
  so guest views are undercounted wherever many like devices share a
  network.
- The minimum for Trending is the same number one address may add in a day.
  One person who clears their cookies five times can put a listed
  submission in Trending alone. The minimum keeps noise out of the row; it
  does not keep a determined person out.
- The day is the UTC day. A viewer who opens a submission at 6 pm and again
  at 9 pm US Eastern is counted twice, on two UTC days.
- A viewer who blocks scripts is never counted.
- An owner who opens their own submission signed out is counted as a guest.
  So is an approver.
- Views can still be inflated by someone with many addresses, or with many
  accounts. The address bound and the route's rate limit make it cost a
  day per handful of views, and what Trending shows was approved by a person
  either way.
- A shared address (a venue, a campus) adds at most five guest views to one
  submission in a day, however many people there open it. Signed-in viewers
  are not bounded this way.
- Two openings at the same instant by one guest (two tabs) spend two of the
  address's five and store one view.
- When the rate limiter's store is down, the address bound is held in each
  server process's memory and starts again when the process does.
- Trending's count grows with the views of the last thirty days. Past a few
  hundred thousand rows it wants the counter this decision rejected. Its
  second read is bounded at a hundred submissions.
- If more than eighty-eight of the hundred most viewed submissions were
  unlisted, Trending would hold fewer than twelve.
- Deleting a submission deletes its views.
