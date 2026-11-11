# Community Submissions, Stage 1: The Text-Only Approval Loop — Design Spec

- **Date**: 2026-11-11
- **Branch**: `feat/user-submitted-content` (off main `a7d92f58`, v4.479.0)
- **Status**: Approved design, ready for implementation planning
- **Vocabulary**: `CONTEXT.md` (submission, attachment, awaiting approval,
  approved / rejected / public / listed / unlisted submission, about,
  writing, upload agreement, community page)
- **Decisions**:
  [ADR-0025](../adr/0025-a-submission-is-public-only-in-the-form-an-admin-approved.md),
  [ADR-0026](../adr/0026-user-files-are-decoded-only-in-an-isolated-lambda.md)
  (stage 2)

## Problem

The site has no way for a fan to contribute anything. The agreed feature lets
a signed-in user post a **submission** that the public sees only after an
admin approves it. It is delivered in five stages. This is the first: the
whole approval loop, end to end, with no file handling at all.

| Stage | Ships                                                       |
| ----- | ----------------------------------------------------------- |
| **1** | **Text-only loop (this spec)**                              |
| 2     | Attachments, the re-encode Lambda, card picture, the caps   |
| 3     | Submission reports                                          |
| 4     | The community page, its search, Most Recent, the menu entry |
| 5     | View counting and Trending                                  |

## Decision

Stage 1 ships a submission that is text only: a title, the writings category,
an **about**, a **writing** and up to ten outbound links. It can be saved as
a draft, published for approval, approved or rejected by an admin, edited,
switched between listed and unlisted, and deleted. Nothing in it is reachable
by anyone but admins until stage 4 opens it.

## Design

### 1. Who can reach it before launch

Every `/community/*` route and every submission Server Action is open to
admins only until stage 4. One module answers "may this session use the
community feature" (`src/lib/community/community-access.ts`); stage 4 changes
that one answer. A non-admin gets the themed not-found page from a route and
a `FORBIDDEN` refusal from an action. No environment variable is added.

### 2. Data model — `prisma/schema.prisma`

Additive only (expand, then contract; `prisma/AGENTS.md`).

```prisma
enum SubmissionCategory {
  VIDEO
  COVER_SONG
  ORIGINAL_SONG
  INFORMATIONAL_VIDEO
  WRITING
  MUSIC_OR_LYRIC_VIDEO
  LIVE_PERFORMANCE
  PHOTO
}

enum SubmissionStatus {
  DRAFT
  AWAITING_APPROVAL
  APPROVED
  REJECTED
}

model Submission {
  id              String             @id @default(auto()) @map("_id") @db.ObjectId
  owner           User               @relation(fields: [ownerId], references: [id])
  ownerId         String             @db.ObjectId
  title           String
  category        SubmissionCategory @default(VIDEO)
  aboutHtml       String             @default("")
  writingHtml     String             @default("")
  links           String[] // http(s) URLs, at most ten with the writing's links
  listed          Boolean            @default(false)
  status          SubmissionStatus   @default(DRAFT)
  publishedAt     DateTime? // last time the owner pressed Publish
  firstApprovedAt DateTime? // set once; Most Recent orders by it (stage 4)
  approvedAt      DateTime?
  approvedBy      String?            @db.ObjectId
  rejectedAt      DateTime?
  rejectedBy      String?            @db.ObjectId
  rejectionReason String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  @@index([ownerId, status])
  @@index([status, publishedAt])
  @@index([status, listed, firstApprovedAt])
}
```

`User` gains `uploadAgreementAt DateTime?` and `uploadAgreementVersion Int?`.

- All eight categories are declared now so stage 2 adds none. The stage 1
  form offers `WRITING` only and sends it explicitly; the service refuses any
  other category until stage 2.
- `status` and `listed` are non-null with defaults, so no query needs the
  null-or-absent filter (`docs/lessons/prisma-mongo/`).
- The default category stays `VIDEO`, as specified, for stage 2.

### 3. Layers

- **Repository** `src/lib/repositories/submission-repository.ts`: the only
  Prisma access. Read models in `src/lib/types/domain/submission.ts`, each
  bound to its `select` with an `AssertExact` drift guard.
- **Visibility rule** `publicSubmission` in
  `src/lib/repositories/_internal/visibility.ts`: `status` is `APPROVED` and
  the owner is not banned, readable as a `where` fragment and as a predicate
  like the two rules there today. It must read "banned" the same way the
  action gate does (`refusalFor`); a ban that has expired is not a ban.
- **Service** `src/lib/services/submission-service.ts`: every rule in
  sections 4 to 7. Returns `ServiceResponse` with a `DataErrorCode`.
- **Server Actions** `src/lib/actions/submissions/`: mutations only, each
  crossing `gateAction`, each validating with Zod
  (`src/lib/validation/submission-schema.ts`).
- **Reads** are Server Components calling the service. Add an API route only
  where a client component needs to refetch.

### 4. States and transitions

| From              | Action                                 | By    | To                | Notes                               |
| ----------------- | -------------------------------------- | ----- | ----------------- | ----------------------------------- |
| (none)            | Save draft                             | owner | DRAFT             |                                     |
| DRAFT             | Save draft                             | owner | DRAFT             |                                     |
| DRAFT             | Publish                                | owner | AWAITING_APPROVAL | Sets `publishedAt`; notifies admins |
| AWAITING_APPROVAL | Edit content                           | owner | AWAITING_APPROVAL | No second admin notice              |
| AWAITING_APPROVAL | Approve                                | admin | APPROVED          | Sets `firstApprovedAt` once         |
| AWAITING_APPROVAL | Reject (reason required)               | admin | REJECTED          | Owner emailed the reason            |
| APPROVED          | Switch listed / unlisted               | owner | APPROVED          | Not a content edit                  |
| APPROVED          | Edit content, after the offline notice | owner | AWAITING_APPROVAL | Offline at once; notifies admins    |
| APPROVED          | Reject (reason required)               | admin | REJECTED          | Owner emailed the reason            |
| REJECTED          | Edit content                           | owner | REJECTED          | Still offline                       |
| REJECTED          | Publish                                | owner | AWAITING_APPROVAL | Clears nothing; reason kept on file |
| any               | Delete                                 | owner | (gone)            | An admin never deletes              |

- "Content" is the title, category, about, writing and links. `listed` is
  not content.
- An admin action on a submission in any other state than the table allows
  answers `INVALID_INPUT`.
- Approve and reject are compare-and-swap on `status` and `updatedAt`, so an
  admin never approves content the owner changed after the admin loaded it.
  The losing write answers `DUPLICATE` and the admin screen reloads.

### 5. Limits

Named constants in `src/lib/constants/submissions.ts`.

| Limit                                                                 | Value       | On breach                         |
| --------------------------------------------------------------------- | ----------- | --------------------------------- |
| Unapproved submissions per user (draft, awaiting approval, rejected)  | 5           | `LIMIT_EXCEEDED`, names the limit |
| Outbound links, the links field and links inside the writing together | 10          | `VALIDATION` on the links field   |
| Title length                                                          | 120         | `VALIDATION`                      |
| About length, as text                                                 | 1,000       | `VALIDATION`                      |
| Writing length, as text                                               | 20,000      | `VALIDATION`                      |
| Rejection reason length                                               | 10 to 1,000 | `VALIDATION`                      |

The cap of five is checked when a draft is created and again, atomically,
when the row is written, the way the tour image cap is. An approved
submission that an edit returns to awaiting approval counts again; that edit
is refused with `LIMIT_EXCEEDED` when the owner already holds five.

A submission may be published only with a title and, in stage 1, a
non-empty writing. Stage 2 widens this to "a writing or an attachment" for
writings and "an attachment" for every other category.

### 6. Text and links

- **About**: bold and italic only. Allowed tags `p`, `br`, `strong`, `em`.
- **Writing**: headings, bold, italic and links. Allowed tags `p`, `br`,
  `h2`, `h3`, `strong`, `em`, `a[href]`.
- Both are sanitized on the server with `sanitize-html`, in a new
  `src/lib/utils/sanitize-submission-html.ts` beside `sanitize-bio-html.ts`.
  The stored HTML is the sanitized HTML. The client editor's toolbar is a
  convenience, never the control.
- Links, in the field and in the writing, are `http(s)` only
  (`httpUrl` from `validation/primitives.ts`). Every rendered link carries
  `rel="nofollow noopener noreferrer"` and `target="_blank"`, set by the
  renderer and forced by the sanitizer, never taken from input.
- The editor is a lean Tiptap editor in `src/app/components/ui/`, with only
  the extensions each field allows. The existing `RichTextEditor` is the bio
  editor (images, figures, bio links) and is not reused as is.

### 7. Upload agreement

- Wording version is a constant, `UPLOAD_AGREEMENT_VERSION = 1`, beside the
  wording itself.
- A user whose account has no agreement at the current version sees the
  checkbox at the top of the form and cannot save or publish without it.
  Accepting writes `uploadAgreementAt` and `uploadAgreementVersion`. Stage 2
  reuses the same record to gate the first upload.
- The service refuses a save or publish from an account without the current
  agreement (`INVALID_INPUT`), whatever the client sent.
- Beside Publish, every time, with no checkbox: "By publishing you confirm
  this is yours to share and follows the community rules."

Wording for version 1, accepted 2026-11-11. Any later change to it is a new
version, and every user is asked again:

> I won't post anything that harms this community: no hate speech,
> harassment or threats. Everything I post is my own, or I have the explicit
> permission of everyone who owns it to share it here.

### 8. Pages

All under `src/app/community/`. Server Components by default.

| Route                  | Who                 | What                                                           |
| ---------------------- | ------------------- | -------------------------------------------------------------- |
| `/community/submit`    | signed in           | The form, empty                                                |
| `/community/<id>/edit` | owner               | The form, loaded                                               |
| `/community/mine`      | signed in           | The owner's submissions in every state, with rejection reasons |
| `/community/<id>`      | see the table below | One submission                                                 |
| `/admin/community`     | admin               | Awaiting approval, approved, rejected                          |

`/community` itself is stage 4.

Who can open `/community/<id>` (after the stage 1 admin-only gate of
section 1 is lifted; under it, only admins reach any of this):

| State                      | Owner | Admin | Anyone else |
| -------------------------- | ----- | ----- | ----------- |
| Draft                      | yes   | no    | not found   |
| Awaiting approval          | yes   | yes   | not found   |
| Rejected                   | yes   | yes   | not found   |
| Approved, owner not banned | yes   | yes   | yes         |
| Approved, owner banned     | no    | yes   | not found   |

- A refusal is always the themed not-found page, never "forbidden", so a
  link does not reveal that a submission exists.
- The owner and admins see a status strip above an unapproved submission
  naming its state and, when rejected, the reason.
- An unlisted submission's page sends `noindex`: it is open to
  anyone with the link, and a search engine is not someone with the link.
- The page shows the title, the owner's avatar (`GravatarAvatar`, by
  precomputed hash, never the email) and username, the about, the writing
  and the links (icon from the href, as `ArtistLinkIcon` derives it).
- A public submission's page carries a share widget with copy-link, built
  from `ReleaseShareWidget`. Extract what the two share rather than passing
  release-shaped props. An unapproved submission shows no share widget.

### 9. The form

React Hook Form, Zod through `zodResolver`, submitted through
`useEntitySubmit` (ADR-0003), failures placed with a `FailureFieldTable`.
Fields in order:

1. Upload agreement checkbox (only when section 7 requires it).
2. Title.
3. Category: a dropdown showing Writings only in stage 1.
4. Writing (the lean editor with headings, bold, italic, links).
5. Listed toggle, off by default. Label: "Show on the User Submitted Content
   page". Help: "Off: only people with the link can open it."
6. About (the lean editor with bold and italic).
7. Outbound links, up to ten, with the helper text "official websites; social
   media post link; or something you think the Fake Four Inc. community
   should know about!".
8. Turnstile widget, then "Save draft" and "Publish".

Copy, as agreed:

- Beside the buttons: "Saving keeps a draft only you can see. Publishing
  sends it to our team for approval; nobody else can open it until it is
  approved."
- After publishing: "Sent for approval. We'll email you when it's live or if
  we need changes."
- Before saving a content edit to an approved submission, a confirm dialog:
  "Editing takes this offline until an admin approves it again."

Save and Publish verify the Turnstile token on the server with the existing
`verifyTurnstile`. The listed toggle on an approved submission saves through
its own action and needs no token and no confirm.

### 10. The admin section — `/admin/community`

- A "Community" entry in `admin-nav-items.ts`.
- Three tabs: Awaiting approval (oldest `publishedAt` first), Approved,
  Rejected. Each row: title, owner username, category, listed or unlisted,
  the relevant date.
- Opening a row shows the submission exactly as the public would see it,
  with Approve and Reject. Reject opens a dialog whose reason is required.
- An approved row offers Reject only.
- The dashboard at `/admin` shows the awaiting-approval count.

### 11. Notices

- **To admins, on every transition into awaiting approval from a draft, a
  rejection or an approved edit**: an email to every admin and a text to
  admins who opted in to SMS, following
  `src/lib/services/abuse-report-notifications.ts`. The fan-out is awaited
  and one admin's failure never blocks another's or fails the publish.
- **To the owner, on approval and on rejection**: an email
  (`src/lib/email/`), the rejection carrying the reason and a link to edit.
  A failed email is logged and never fails the admin's action.
- No notice carries the about or the writing, only the title and a link.

### 12. Edge cases

- Two tabs: the owner saves an edit in one while the other holds stale
  content. Last write wins on drafts; on an approved submission the confirm
  dialog is shown per save.
- The owner is banned while a submission awaits approval: it stays in the
  admin list, and the action gate already refuses the owner's every action.
- The owner changes username: nothing stored on a submission changes; the
  page reads the current username.
- A deleted submission's `/community/<id>` is not found for everyone.
- An admin is also an owner: their own submission still needs approval, and
  they may approve it. Refusing self-approval was rejected: it blocks a
  label with one admin.

### 13. Acceptance criteria

1. A signed-in admin without a current upload agreement cannot save or
   publish until the checkbox is ticked; ticking it records the date and
   version on the account, and the checkbox is not shown again.
2. Save draft creates a submission only its owner can open; a signed-out
   visitor and another signed-in user both get not found.
3. Publish moves it to awaiting approval, shows the agreed message, and
   sends each admin one notice.
4. The submission's link returns not found for a signed-out visitor until an
   admin approves it, whether listed or unlisted.
5. After approval the link opens for a signed-out visitor, the page shows the
   share widget, and the owner receives an email.
6. Switching listed to unlisted on an approved submission keeps it approved
   and reachable, and sends no notice.
7. Saving a content edit to an approved submission shows the offline confirm;
   on confirm the link returns not found for a signed-out visitor at once and
   the submission is awaiting approval again.
8. Rejecting without a reason is refused. With a reason, the submission goes
   offline, the owner is emailed the reason, and `/community/mine` shows it.
9. A rejected submission can be edited and published again, returning to
   awaiting approval.
10. A sixth unapproved submission is refused with `LIMIT_EXCEEDED` and a
    message naming the limit; approved submissions are not counted.
11. An eleventh outbound link, counting links inside the writing, is refused.
12. `<script>`, `<img>`, event-handler attributes and a `javascript:` href in
    the about or the writing are absent from the stored HTML; a heading or a
    link in the about is removed.
13. Every rendered outbound link has `rel="nofollow noopener noreferrer"`.
14. A banned owner's approved submission returns not found for a signed-out
    visitor and opens again once the ban is lifted, with no change to its row.
15. A non-admin gets not found from every `/community/*` route and a refusal
    from every submission action (the pre-launch gate).
16. An admin's approve of content that changed since the admin loaded it is
    refused, and the admin screen shows the current content.
17. The owner can delete a submission in any state; its link is then not
    found for everyone.

### 14. Testing (TDD, per repo rules)

- Service specs first, one per row of the transition table, plus the cap,
  the link count, the publishability rule and the agreement refusal.
- A contract spec on Docker Mongo for the cap of five under concurrent
  creates, in the pattern of `playlist-item-cap.contract.spec.ts`.
- A contract spec for `publicSubmission` covering a banned owner, an owner
  whose ban expired, and an absent `banned` field.
- Sanitizer specs from a table of hostile inputs.
- `scripts/check-server-action-gates.spec.ts` must pass with no
  `action-gate: public` exemption added.
- One E2E spec on the isolated Mongo (`e2e/AGENTS.md`): publish, see not
  found signed out, approve as admin, see it signed out, edit, see not found
  again. Turnstile through `e2e/helpers/turnstile-mock.ts`.

### 15. Out of scope

- Attachments, uploads, the re-encode Lambda, the card picture, the cap of
  ten attachments, and every category but Writings (stage 2).
- The report control and its admin view (stage 3).
- `/community`, its search, both submission rows, the per-user filter, and
  the public menu entry (stage 4).
- Views and Trending (stage 5).
- Adding a submission to a Playlist. Not planned.

## Implementation constraints (repo rules that will bite here)

- Work in the worktree; copy nothing out of `.env*`; anything that writes
  data runs against Docker Mongo on `localhost:27018` with a command-scoped
  `DATABASE_URL` (hard constraint 1).
- Only repositories import Prisma (`no-restricted-imports`).
- Every new source file takes the MPL header from `HEADER.txt`.
- Named exports; Server Components by default; no return-type annotation on
  components.
- The schema change is additive, so the deploy's `schema-push` job applies it
  (ADR-0012) and a one-step rollback stays safe (ADR-0021).
- Read `src/AGENTS.md`, `src/app/AGENTS.md`, `src/lib/AGENTS.md`,
  `prisma/AGENTS.md` and `e2e/AGENTS.md`, and load the `prisma-mongo`,
  `react-nextjs`, `testing`, `validation` and `e2e-playwright` lessons,
  before building.
- This Next.js has breaking changes; read the relevant guide in
  `node_modules/next/dist/docs/` before writing route or metadata code.

## Settled after the first draft (2026-11-11)

The owner accepted the upload agreement wording (section 7), the field
lengths (section 5), `noindex` on unlisted pages (section 8) and admin
self-approval (section 12) as written.

## Open item for the owner

Who answers the approval queue, and how quickly. Not decided in design, and
no recommendation was made; every publish, edit and rejection waits on it.
It does not block building stage 1, which is admin-only.
