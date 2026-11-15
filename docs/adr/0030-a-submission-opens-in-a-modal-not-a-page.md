# ADR-0030: A submission opens in a modal, not a page

- **Status**: Accepted
- **Date**: 2026-11-15

## Context

Since the community opened (2026-11-14), a submission was a page of its own
at `/community/<id>`. A card, a search result, a row of the owner's list and
the form's "View your submission" each navigated there, away from the list
the visitor was browsing. On 2026-11-15 the owner asked for the opposite: a
submission clicked anywhere opens in a modal on a desktop and a drawer on a
phone, and the submission page is removed.

Releases made the same move in ADR-0023, and three things carry over from
it: the permalink becomes a deep link on a listing, the old URL redirects,
and every opener opens in place.

Two facts about this codebase shaped the rest:

- The page was rendered on the server for one reader. A modal opened by a
  click has no server render, so the same read has to cross the network.
- A page under the root loading boundary cannot answer a real status. The
  proxy answered the old page's `404` after a database read on every
  request.

## Decision

**A submission is opened in the submission modal wherever it is clicked. It
has no page; its permalink is the submission deep link.**

- **One modal, hosted by the community layout.** `SubmissionModalProvider`
  holds the one modal for every page under `/community`. It is a centred
  dialog from 768px and a drawer rising from the bottom below that
  (`ResponsiveLightbox`). The submission's players, sharing and report form
  load when a submission is first opened, not with the page.
- **Every opener opens it in place.** A card, a search result, a row of the
  owner's list and the form's "View your submission" open it on a plain
  click. The address does not change. Each opener's href is the deep link,
  which a modified click opens in a new tab, and which a click made before
  the page has hydrated follows to the same submission.
- **The deep link is the permalink.** `/community?submission=<id>` is the
  community page with the modal open on that submission. The page reads the
  submission on the server for this reader, hands it to the modal, and
  titles itself with it, so a shared link previews as the submission.
  Closing the modal replaces the address with the same page without the
  parameter, so back and refresh do not reopen it. The share row copies the
  deep link and the approval email links it.
- **The modal reads the submission from a public route.**
  `GET /api/community/submissions/<id>` answers what this caller may see:
  the public a public submission, its owner and approvers any. An id that
  names nothing, a submission the caller may not open and a banned account
  get the same `404`. The answer leaves out the owner's id and the dates,
  which no screen reads.
- **An opening in place reads afresh.** It drops whatever the browser held
  of that submission first. A rejection, an edit or a ban takes a submission
  offline, and what a reader saw a minute ago must not be shown in its
  place.
- **A submission the reader may not open says so, without a reason.** The
  modal opens and reads "This submission is not available", whether the
  link is dead, the submission is offline, or the reader needs to sign in.
  The page beneath still renders. There is no `404` for it: the deep link
  is the community page, which exists.
- **The old URL redirects.** `/community/<id>` is a `308` to the deep link,
  from the proxy, for every well-formed id. It reads nothing and reveals
  nothing; who may open the submission is decided where the link lands.
- **It is open only where it was opened.** A link inside it, or the
  browser's back, closes it. When it closes, focus returns to what the
  visitor clicked.
- **A view is an opening in the modal.** The beacon that counts a view
  (ADR-0029) mounts with the submission the modal shows. A link preview or
  a crawler renders the page beneath, never opens the modal, and is never a
  view. Where ADR-0029 says a view is counted by the page, it is now
  counted by the modal.
- **The approver's review page stays a page.** `/admin/community/<id>` is
  where a decision is made, with the reports beside it. The form and the
  edit page stay pages too.

## Alternatives rejected

- **Intercepting and parallel routes** (`@modal/(.)community/[id]`). That
  keeps the page, and the owner asked for it to go. A click before
  hydration would also land on the page, a second way to read a submission
  that every opener would have to account for.
- **Putting the open submission in the address** (`pushState` on every
  open). The back button would close the modal, which a phone user may
  expect. But a Server Action that revalidates then refreshes the tree for
  the new address, which remounts the page under the modal
  (`docs/lessons/react-nextjs/replacestate-route-swap-remounts-the-page.md`),
  and release modals do not do it either.
- **A redirect only for a public submission, a `404` otherwise.** It needs
  the database read in the proxy that the old page needed, and it answers
  "exists" and "does not" differently to a signed-out prober.
- **Showing the list alone for a dead link**, as a release deep link does.
  A visitor who followed a link to a submission that was taken down would
  see a page of other submissions and no word about the one they came for.

## Consequences

- The back button leaves the page while a submission is open; it does not
  close the modal. Release modals behave the same.
- A deep link to a submission the reader may not open answers `200`, as the
  community page it is. The site is not indexed, and the modal's read
  answers `404`.
- An opening in place costs one request, where the page cost a navigation.
- `SubmissionService.isPublic` and its repository read are gone with the
  proxy's status check. No action revalidates a submission's page, since
  there is none.
- A submission opened from a page outside `/community` has no modal to open
  in. Its opener is then a plain link to the deep link.
