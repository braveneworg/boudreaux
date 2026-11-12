# Community Submissions, Stage 2: Attachments — Design Spec

- **Date**: 2026-11-11
- **Branch**: `feat/submission-attachments` (off main `2f8fff03`, v4.481.0)
- **Status**: Design
- **Builds on**:
  [stage 1](2026-11-11-community-submissions-stage-1-design.md)
- **Vocabulary**: `CONTEXT.md` (attachment, re-encoded copy, card picture,
  job runner, async job lifecycle, signed callback)
- **Decisions**:
  [ADR-0025](../adr/0025-a-submission-is-public-only-in-the-form-an-admin-approved.md),
  [ADR-0026](../adr/0026-user-files-are-decoded-only-in-an-isolated-lambda.md),
  [ADR-0027](../adr/0027-an-attachment-reaches-the-cdn-only-while-its-submission-is-approved.md)

## Problem

Stage 1 shipped the approval loop for text. A submission still cannot carry
a file, so only a writing can be published. Stage 2 adds **attachments**:
up to ten videos, audio files or images on a submission, each served only as
its **re-encoded copy**, and with them the other seven categories and the
**card picture**.

Nothing here is public yet. Only approvers reach `/community/*` until
stage 4.

## Design

### 1. Data model — `prisma/schema.prisma`

Additive only.

```prisma
enum SubmissionAttachmentKind {
  IMAGE
  AUDIO
  VIDEO
}

model SubmissionAttachment {
  id                String                   @id @default(auto()) @map("_id") @db.ObjectId
  submission        Submission               @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  submissionId      String                   @db.ObjectId
  kind              SubmissionAttachmentKind
  fileName          String // as uploaded; shown to the owner and approvers only
  uploadKey         String                   @unique // the original, in the private bucket
  uploadBytes       Int
  uploadType        String
  copyKey           String? // the re-encoded copy
  cardKey           String? // a small picture of an image or a video
  posterKey         String? // a video's frame at full size
  copyBytes         Int?
  width             Int?
  height            Int?
  durationSeconds   Int?
  reencodeStatus    String?
  reencodeError     String?
  reencodeStartedAt DateTime?
  reencodeJobToken  String?
  reencodeProgress  Json?
  createdAt         DateTime                 @default(now())

  @@index([submissionId, createdAt])
}
```

- One row per attachment, and each row is one job: the `reencode*` columns
  are the async job lifecycle's, like `Video.enrichment*`.
- Attachments read in upload order: `createdAt`, then `id`.
- `uploadKey` is unique, so confirming one upload twice makes one row.
- `kind` starts as what the upload's type says and is overwritten by what
  the re-encode found.

### 2. Storage (ADR-0027)

Two buckets, behind one seam, `src/lib/services/submission-attachment-store.ts`,
with an S3 adapter and a local adapter for E2E.

| Object            | Bucket  | Key                                                            | Lives                             |
| ----------------- | ------- | -------------------------------------------------------------- | --------------------------------- |
| Upload (original) | private | `uploads/<submissionId>/<uuid>`                                | Until its job ends; 1 day at most |
| Re-encoded copy   | private | `copies/<submissionId>/<attachmentId>/copy.<ext>`              | As long as the attachment         |
| Card, poster      | private | `copies/<submissionId>/<attachmentId>/card.webp`, `poster.jpg` | As long as the attachment         |
| Published files   | media   | `media/submissions/<submissionId>/<attachmentId>/…`            | While the submission is approved  |

- The public key is the private key with `copies/` replaced by
  `media/submissions/`.
- A reader of a public submission gets CDN URLs. The owner or an approver
  reading one that is not public gets signed links to the private copies,
  valid for an hour.
- Runtime config, both optional so the app deploys before the stack exists:
  `SUBMISSION_UPLOADS_BUCKET` and `SUBMISSION_REENCODER_LAMBDA_NAME`. With
  either unset, an upload is refused with "Uploads are not set up yet."

### 3. Upload limits

Constants in `packages/job-contract`, shared by the app and the Lambda.

| Kind  | Accepted types                                       | Upload limit       | Kept as                                            |
| ----- | ---------------------------------------------------- | ------------------ | -------------------------------------------------- |
| Image | JPEG, PNG, WebP, GIF, AVIF, TIFF                     | 20 MB              | JPEG, at most 2560 px on the long side, quality 70 |
| Audio | MP3, M4A/AAC, WAV, FLAC, Ogg, Opus, AIFF, WebM audio | 50 MB              | MP3, at most 192 kbps and never above the source   |
| Video | MP4, MOV, WebM, Matroska, AVI, M4V, 3GPP             | 500 MB, 10 minutes | MP4 (H.264 + AAC), short side at most 720 px       |

- The upload is one presigned `PUT` with its length and type signed in, so
  S3 refuses a body of any other size. There is no multipart path.
- The app decides the kind from the declared type and checks the size
  against that kind's limit before signing. The Lambda checks both again
  against the real file.
- Ten attachments per submission, counted atomically when a row is made.
- HEIC is not accepted. Mobile Safari converts a HEIC photo to JPEG when the
  picker does not list HEIC.
- Not agreed in the grilling, added as a guard: audio longer than three
  hours is refused, so a long low-bitrate file cannot be kept as a much
  larger MP3.

### 4. The re-encode Lambda (ADR-0026) — `submission-reencoder/`

A second Lambda project beside `bio-generator/`, deployed by its own SAM
stack as a container image with `sharp` and a static ffmpeg pinned by
digest.

- **Its stack also creates the private bucket**: no public access, CORS for
  a browser `PUT` from the site, `uploads/` expiring after one day.
- **Permissions**: read and delete under `uploads/`, write under `copies/`,
  in that bucket only. No secret, no parameter store, no other bucket.
- **Invoke payload** (`submissionReencodeInputSchema`): the attachment id,
  declared kind, bucket, upload key, copy prefix, and the runner's dispatch
  fields.
- **Image**: decoded by `sharp` with a pixel limit, orientation baked in,
  metadata dropped. Writes `copy.jpg` and `card.webp` (640 px).
- **Audio and video**: probed by ffprobe, transcoded by ffmpeg, both held to
  local files and to an allowlist of container formats and to no network
  protocol, so a playlist or a concat script is refused instead of
  followed. Metadata, chapters, subtitles and data streams are dropped.
  Video also writes `poster.jpg` and `card.webp` from a frame of the copy.
- **A video upload with no picture is kept as audio**, and the result says
  so.
- **Progress stages**: `downloading`, `probing`, `encoding`, `storing`.
- **Failure** is a code, mapped to copy by the app: `too-large`, `too-long`,
  `unreadable`, `unsupported`, `failed`.
- **The upload is deleted** when the run ends, whichever way.

### 5. Job runner

- `JobKind` gains `'submission-reencode'`.
- A job adapter may name its own Lambda (`functionName`); the invoker falls
  back to the bio generator's. This is the runner's one change.
- The adapter is `submissionReencodeJob`, on an attachment id. Its local
  fake answers with the keys a real run would write, so E2E crosses the
  real callback route.

### 6. Rules — `SubmissionAttachmentService` and `SubmissionService`

**Uploading**

1. `requestUpload`: the owner holds the current upload agreement, owns the
   submission, the type is accepted, the size is within its kind's limit,
   and the submission holds fewer than ten attachments. Answers a presigned
   URL and the upload key. Rate-limited per user.
2. The browser `PUT`s the file.
3. `confirmUpload`: the key is under this submission's prefix and the
   object exists. Makes the row within the cap of ten, then starts the job.

**Attachments are content.** Adding or removing one:

- touches the submission's `updatedAt`, so an approver who loaded it before
  the change cannot decide on it (stage 1's compare-and-swap);
- on an approved submission, takes it offline and returns it to awaiting
  approval, exactly as a text edit does: counted against the cap of five,
  approvers notified, files removed from the CDN. The form warns first.

**Removing**

- Refused while the attachment's job is in flight. A job past the stale
  window is not in flight.
- Refused when it would leave a submission that is awaiting approval or
  approved with nothing to publish.

**Publishing** (stage 1's rule, widened)

- A writings submission needs a writing or an attachment. Every other
  category needs an attachment.
- Every attachment must have its re-encoded copy: none in flight, none
  failed.
- All eight categories are open.

**Approving**

- Refused while any attachment lacks its copy.
- Publishes the files, then writes the decision; removes them again if the
  decision loses its race.

**Rejecting an approved submission, and deleting**

- Remove the published files. Delete also removes the private ones, and is
  refused while a job is in flight.

### 7. Card picture

`cardPictureOf(attachments)`: the card of the first image attachment, else
of the first video attachment, else none (the caller shows a tile naming the
category). Shown in the owner's list and the approver's queue, and as the
shared-link preview of a public submission.

### 8. Surfaces

- **Server Actions** `src/lib/actions/submission-attachment-actions.ts`:
  `requestAttachmentUploadAction`, `confirmAttachmentUploadAction`,
  `removeAttachmentAction`. All cross the gate as `signed-in` and the
  pre-launch lock.
- **Routes**:
  `POST /api/community/attachments/[id]/reencode/callback` and `/progress`
  (signed callbacks);
  `GET /api/community/submissions/[id]/attachments` (the polled list, for
  the owner and approvers).
- **Form**: an attachments section with a drop target, per-file upload
  progress and cancel, the processing stage, a preview when ready, the
  failure and a remove control. Dropping the first file on a new submission
  saves it as a draft first, since an attachment needs a submission to
  belong to.
- **Submission page**: images, an audio player per audio attachment, the
  existing `VideoPlayer` per video.

## Acceptance criteria

1. An accepted image, audio file and video can each be attached, and each
   shows as processing and then as ready with a preview.
2. A file of a type not accepted, or over its kind's limit, is refused
   before any upload, naming the limit.
3. An eleventh attachment is refused, including when two uploads are
   confirmed at once (contract spec on Docker Mongo).
4. A user without the current upload agreement cannot request an upload.
5. A user cannot request, confirm or remove on a submission they do not
   own.
6. A confirm for a key outside the submission's upload prefix, or for an
   object that does not exist, is refused.
7. The presigned upload signs the declared length and type.
8. A callback with a bad signature or a spent token changes nothing.
9. A failed re-encode shows its reason and the attachment can be removed.
10. A submission in any category but writings cannot be published without
    an attachment; a writings submission can be published with either.
11. A submission cannot be published or approved while an attachment is
    processing or failed.
12. Adding or removing an attachment on an approved submission returns it to
    awaiting approval, counts against the cap of five and notifies
    approvers.
13. An approver who loaded a submission before an attachment changed is
    refused with the stale-decision message.
14. Approving copies every attachment file to the media bucket; a failed
    copy leaves the submission awaiting approval.
15. Rejecting an approved submission, a content edit to one, and deleting
    one each remove its files from the media bucket.
16. A public reader is given CDN URLs; the owner and an approver of a
    submission that is not public are given signed links.
17. Removing an attachment whose job is in flight is refused; one past the
    stale window can be removed.
18. The card picture is the first image's, else the first video's, else
    none.
19. The Lambda refuses a playlist or a concat script, a video over ten
    minutes, and a file larger than its kind's limit.
20. The Lambda deletes the upload after a success and after a failure.
21. With the bucket or the Lambda name unset, an upload is refused with one
    clear message and nothing else in the feature breaks.
22. E2E: attach an image to a new submission, see it ready, publish, and
    approve as a manager.

## Out of scope

- Reports (stage 3), the community page (stage 4), views (stage 5).
- Reordering attachments, captions, and choosing the card picture.
- Resumable or multipart uploads.
- Retrying a failed re-encode in place: remove it and upload again.
- HEIC.

## Operator steps this stage needs

The code deploys without these and uploads stay off until they are done.

1. The first run of the Lambda's deploy workflow needs the deploy role to be
   able to create an ECR repository and push to it.
2. Give that workflow the app's AWS principal (`APP_AWS_PRINCIPAL_ARN`), so
   the bucket's policy lets the app sign uploads and read copies.
3. Set `SUBMISSION_UPLOADS_BUCKET` and `SUBMISSION_REENCODER_LAMBDA_NAME`
   for the app from the stack's outputs, and deploy the app again.
