# ADR-0025: A submission is public only in the form an admin approved

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

Signed-in users will post submissions (clips, songs, photos, writing) to the
community page. The label's name sits on that page, and a submission's link
is on the label's domain, so a link is public in practice whether or not the
submission is listed. The first design had a private/public toggle and a
Publish button and no review: a user's Publish made a submission reachable.

## Decision

**No part of a submission reaches the public, by a listing or by its link,
until an admin has approved it, and approval covers only the content the
admin saw.**

- **Publish asks for approval.** A published submission is awaiting
  approval: open to its owner and to admins only.
- **An edit to an approved submission's content takes it offline.** It
  returns to awaiting approval and is unreachable until an admin approves it
  again. The form warns the owner before the edit is saved.
- **Switching between listed and unlisted is not an edit.** The admin
  approved the content for both, so the owner's choice of where it appears
  needs no second look.
- **Unlisted submissions are reviewed too.** They are open to anyone who
  holds the link.
- **A refusal is a rejection with a written reason**, before or after
  approval. The owner reads the reason and may edit and publish again. An
  admin never silently deletes.
- **A submission report changes nothing by itself.** It informs admins; only
  a rejection takes a submission offline.
- **A banned owner's submissions are hidden, not rewritten.** They stay
  approved underneath and return when the ban ends.

## Alternatives rejected

- **Edits go live at once.** Approval becomes a gate anyone walks around by
  submitting something harmless first.
- **Pending revisions**, where the approved version stays up while an edit
  waits. It avoids the offline window but needs a second copy of every field
  and attachment and a diff view for admins, for a case expected to be rare.
- **Hide automatically after N reports.** It hands anyone a way to take
  down someone else's submission with throwaway reports, and the owner has
  no one to appeal to.
- **Reject every submission of a banned owner.** Each needs a written reason,
  and lifting the ban means re-approving them one by one.

## Consequences

- Fixing a typo in a title takes a popular submission offline for as long as
  an admin takes to look. This is deliberate; revisit with pending revisions
  if it proves common.
- Admin response time is now part of the product. Each publish and each
  report notifies every admin.
- A ban for a reason unrelated to submissions still hides them all, and no
  per-submission exception exists.
- Most Recent orders by first approval, so re-approval after an edit never
  moves a submission back to the front.
