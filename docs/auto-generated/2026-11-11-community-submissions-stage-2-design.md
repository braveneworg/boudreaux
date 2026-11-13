# Community Submissions, Stage 2: Attachments — Design Spec

- **Date**: 2026-11-11
- **Branch**: `feat/submission-attachments` (off main `2f8fff03`, v4.481.0)
- **Status**: Implemented on the branch; see "As built" at the end
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

1. Give the deploy role (`GitHubActionsDeployRole`) what the Lambda's deploy
   workflow (`deploy-submission-reencoder.yml`) needs beyond the other two
   Lambdas' deploys: the policy under "The deploy role's policy" below. Until
   it has it, that workflow fails at `sam deploy`; the app's own deploy is a
   separate workflow and is not affected.
2. Set the repository variable `APP_AWS_PRINCIPAL_ARN` to the ARN the app
   runs as: the IAM user that owns the app's `AWS_ACCESS_KEY_ID`. The stack
   then lets the app sign uploads, read copies and invoke the function. A
   principal that does not exist fails the deploy.
3. Run the workflow (`gh workflow run deploy-submission-reencoder.yml`). If
   an earlier run failed, first delete the stack it left in
   `ROLLBACK_COMPLETE`, named
   `fakefour-submission-reencoder-5500c98a-CompanionStack`: SAM tries to
   update it, and CloudFormation refuses to update a stack in that state.
4. Set the repository variables `SUBMISSION_REENCODER_LAMBDA_NAME`
   (`fakefour-submission-reencoder`) and `SUBMISSION_UPLOADS_BUCKET`
   (`fakefour-submission-uploads-<ACCOUNT_ID>`). Both names are fixed by the
   template, and the workflow prints them. Set them only once the stack
   exists: with them set the app offers uploads.
5. Deploy the app again. Its deploy has no manual trigger, so this is the
   next merge to main. Do not re-run a finished
   `CI/CD - Build, Publish, Deploy` run to do it: that runs its version bump
   again and cuts a second release for the same pull request.
6. If `ALERT_EMAIL` is set, confirm the alarm's subscription email.

### The deploy role's policy

Attach it as an inline policy
(`aws iam put-role-policy --role-name GitHubActionsDeployRole --policy-name SubmissionReencoderDeploy --policy-document file://policy.json`).
The Lambda actions the stack needs are already in the role's
`AWSLambda_FullAccess`. The repository name is the one SAM derives from the
stack's name for `--resolve-image-repos`, and does not change while the
stack keeps its name.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ReencoderImageRepository",
      "Effect": "Allow",
      "Action": "ecr:*",
      "Resource": "arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/fakefoursubmissionreencoder5500c98a/*"
    },
    {
      "Sid": "SubmissionUploadsBucket",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::fakefour-submission-uploads-<ACCOUNT_ID>"
    },
    {
      "Sid": "ReencoderAlarmTopic",
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:ListSubscriptionsByTopic",
        "sns:TagResource",
        "sns:UntagResource",
        "sns:ListTagsForResource"
      ],
      "Resource": [
        "arn:aws:sns:us-east-1:<ACCOUNT_ID>:fakefour-submission-reencoder-alarms",
        "arn:aws:sns:us-east-1:<ACCOUNT_ID>:fakefour-submission-reencoder-alarms:*"
      ]
    }
  ]
}
```

`ecr:*` and `s3:*` are scoped to the one repository and the one bucket. The
bucket statement names the bucket and not its objects, so the role can
configure the bucket and cannot read what is in it.

## As built (2026-11-11)

Stage 2 is implemented on `feat/submission-attachments`. Where the build
differs from the design above, the build is what the code does and this
section says why. The acceptance criteria were not changed.

### Differences from the design

- **Section 8, the first file on a new submission.** Dropping a file does
  not save a draft by itself. A submission that is not saved yet shows
  "Save a draft first. Then you can add photos, audio and video to it here."
  in place of the drop target, and the drop target appears on the edit page
  the save lands on. Saving silently on a drop would have had to spend the
  form's single-use verification and swap the address under an upload in
  flight (`docs/lessons/react-nextjs/replacestate-route-swap-remounts-the-page.md`).
- **Section 8, the players.** A video uses the site's `VideoPlayer` behind
  its poster. Audio uses the browser's own `<audio>` element: the site's
  audio player is built around a release. The caption lint rule is off for
  that one file, since a user's upload has no caption track.
- **Section 4, packaging.** The handler is bundled before the image is
  built, so the image's build context is `submission-reencoder/` alone. The
  ffmpeg image is pinned by digest (`mwader/static-ffmpeg:8.1.1`); the
  Lambda base image is left on its tag so each deploy takes AWS's patches.
- **Section 4, what the Lambda adds.** Lambda's own retries of a failed
  invoke are off, so a file that crashes a decoder is not decoded twice
  more. ffmpeg and ffprobe are run with `PATH` only, so the role's
  credentials are not in a decoder's environment. An encode is capped a
  little past its limit and the written copy is measured again, so a file
  that hides its length is still refused. Transparency in a photo is
  flattened onto white. sharp's loaders are limited to the accepted image
  formats.
- **Section 4, the stack.** It also grants the app's principal
  `lambda:InvokeFunction`, and the bucket refuses plain HTTP.
- **Section 6, removing.** A removal from a published submission is checked
  against the attachments that are ready, so a failed attachment is never a
  reason another one cannot be removed.
- **Stage 1's rule, tightened.** A save to a submission that is awaiting
  approval or approved is held to the publish rules, whichever button sent
  it. Before, such a save could empty the writing in place.
- **The card picture in lists.** An approved submission's card picture comes
  from the CDN even while its owner is banned: hiding a submission does not
  remove its files (ADR-0027).

### How it was checked

- **Unit**: 17,909 tests with typecheck, lint and format; the coverage check
  passes (branches 95.13% against a 95% floor).
- **Real database**: the cap of ten, the submission's `updatedAt` moving on
  a creation, the job's begin gate, and a deleted submission's attachments
  going with it, on Docker Mongo. The cap spec was run with the serialising
  write removed and fails every time; see
  `docs/lessons/testing/a-race-spec-is-proved-by-removing-the-lock.md`.
- **Real ffmpeg**: the Lambda's 28 integration specs ran against ffmpeg and
  ffprobe 8.1.1, including a playlist and a concat script that are refused.
  The image was built for arm64 and the bundled handler was run inside it
  with no network: a video, an audio file and a photo came out as H.264 and
  AAC in MP4, MP3, and JPEG.
- **End to end**: a photo is attached, re-encoded through the real signed
  callback route by the fake Lambda, published and approved; it passed three
  times across four workers on the dev server.

### Known gaps

- **No file has gone through it on AWS.** The stack was first deployed on
  2026-11-12 (see "First deploy" below), and what it created was read back.
  A real browser upload against the bucket's CORS, the presigned URL
  refusing a wrong length, a re-encode in the deployed function, the copy on
  approval and the invalidation on unpublish are still untested.
- **Encode time is not measured.** A ten-minute video on 3008 MB has not
  been timed against the 11-minute budget.
- **The E2E attaches a photo only.** Audio and video go through the same
  routes with a different fake result; the real encodes are covered by the
  Lambda's integration specs, not end to end.
- **No production-build E2E run.** CI runs it on the production build.
- **A deleted account's files are not removed.** Deleting a user cascades
  to their submissions and attachments in the database; nothing deletes the
  files.
- **A file left by a re-encode whose attachment was removed.** Removal is
  refused while a job is in flight, but a job past the stale window can be
  removed and may still write a copy afterwards. Nothing points at it.
- **HDR video is not tone-mapped**, and a video-typed upload that turns out
  to be audio is held to the video size limit.
- **Stage 1's gaps still stand**: not found is the themed page with a 200,
  and no E2E covers a signed-out visitor.

### First deploy (2026-11-12)

The stack took three runs of the deploy workflow to create.

1. **`sam build` failed** on the first run on main. SAM's default builder
   cannot build the arm64 image on the x86-64 runner. #947 builds with
   BuildKit and builds the image on every pull request; see
   `docs/lessons/tooling/a-main-only-workflow-is-first-tested-after-the-merge.md`.
2. **`sam deploy` failed** on the second: the deploy role had no ECR
   permissions. It also lacked the uploads bucket and the alarm topic, which
   would have failed next. The operator steps above first listed the wrong
   permissions, written without reading the role; see
   `docs/lessons/ops/read-the-role-before-listing-what-it-lacks.md`.
3. **The third succeeded**, after the policy above was attached and the
   failed companion stack deleted.

Read back from AWS afterwards: the stack is `CREATE_COMPLETE`; the function
is active, arm64, 3008 MB, 900 s; its invoke permission and the bucket's
policy name the app's IAM user; the bucket blocks all public access, has the
CORS rule for the two site origins and both expiry rules; the alarm's email
subscription is pending confirmation.
