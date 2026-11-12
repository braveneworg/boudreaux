# ADR-0027: An attachment reaches the CDN only while its submission is approved

- **Status**: Accepted
- **Date**: 2026-11-11

## Context

ADR-0025 says no part of a submission reaches the public until an approver
has approved it. ADR-0026 says only the re-encoded copy of an attachment is
ever served. Neither says where the files live.

The site's media bucket is served whole by the CDN: any object in it has a
public URL the moment it is written. An owner sees their own attachments
before approval, so they would hold those URLs. A file put there before
approval could be linked from anywhere, on the label's domain, with no
approver ever having seen it. Approval would then cover the submission's
page and not its files.

## Decision

**Uploads and re-encoded copies live in a private bucket the CDN cannot
read. Approving a submission copies its attachments' files to the media
bucket; taking it offline deletes them there.**

- **The private bucket holds two prefixes.** `uploads/` takes the browser's
  upload and expires after a day. `copies/` holds each attachment's
  re-encoded copy for as long as the attachment exists.
- **Before approval, a copy is read through a short-lived signed link**, made
  for the owner or an approver on each page load.
- **Approval publishes the files first, then writes the decision.** If any
  file fails to copy, the submission is not approved. If the decision loses
  its race, the files are removed again.
- **Rejecting an approved submission, a content edit that sends it back for
  approval, and deleting it all remove its files from the media bucket** and
  ask the CDN to drop them.
- **A public file's address is derived from its private one**, so nothing
  about publication is stored on the attachment.

## Alternatives rejected

- **Write copies to the media bucket under an unguessable name.** One
  bucket and no copy step, but every unapproved file is public to anyone
  the owner gives its address to, and a rejected file stays up.
- **Keep everything private and sign every public read.** Nothing is ever
  copied, but no public page could be cached, every card picture on the
  community page would be signed per request, and nothing would be served
  from the CDN's edge.
- **Deny the CDN one prefix of the media bucket.** No second bucket, but
  that bucket's policy is applied by hand and a mistake in it takes the
  site's media down.

## Consequences

- An approved attachment is stored twice. The private copy is the one kept;
  the public one can always be made again from it.
- Approving waits on up to thirty server-side copies. They run in the same
  region and in parallel.
- A file already cached at the CDN's edge can outlive its removal by the
  time the invalidation takes.
- A banned owner's submissions are hidden by the public rule, and their
  files stay in the media bucket until the ban ends or an approver rejects
  them. Hiding does not remove files.
- The app needs to write, read and delete in the private bucket. The
  re-encode Lambda's stack creates the bucket and grants that.
