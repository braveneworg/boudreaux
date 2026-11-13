# Community Submissions, Stage 3: Submission Reports — Design Spec

- **Date**: 2026-11-12
- **Branch**: `feat/submission-reports` (off main `9f8e9e7f`, v4.484.0)
- **Status**: Implemented on the branch; see "As built" at the end
- **Vocabulary**: `CONTEXT.md` (submission report, open report, public
  submission, approver, manager)
- **Decisions**:
  [ADR-0025](../adr/0025-a-submission-is-public-only-in-the-form-an-admin-approved.md)
  (a report changes nothing by itself),
  [ADR-0028](../adr/0028-a-submission-report-does-not-record-who-filed-it.md)
- **Earlier stages**:
  [stage 1](2026-11-11-community-submissions-stage-1-design.md),
  [stage 2](2026-11-11-community-submissions-stage-2-design.md)

## Problem

Stage 4 opens submissions to the public. Before it does, anyone who is
wronged by a submission needs a way to tell the label, whether or not they
have an account: the person in a photo, the writer of a song someone else
posted. This stage is that way. It ships before the menu entry on purpose.

## Decision

Anyone who can open a public submission's page can file a **submission
report** against it: a reason, an optional note and an optional contact
email, guarded by Turnstile. A report notifies approvers and appears in the
approver section against the submission. It never takes a submission offline;
only an approver's rejection does (ADR-0025). An approver marks a report
handled once it has been looked at.

## Settled with the owner (2026-11-12)

| Question                    | Answer                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limits                 | Per reporter: one report per submission and five across all submissions, per rolling 24 hours. Per submission: after three notices in 24 hours, further reports are stored and shown to approvers but send no email or text.                  |
| The contact email           | Only admins read it. A manager sees that one was left and asks an admin. It is erased from the report 90 days after filing.                                                                                                                   |
| Who is told                 | Every approver: an email to each, a text to those who opted in to SMS.                                                                                                                                                                        |
| Handling                    | A report is open until an approver marks it handled, with one press; who and when are recorded. Rejecting a submission handles all its open reports. The approver section gains a Reported tab, and the admin dashboard shows the open count. |
| Auto-hide after N reports   | No, and not to be added (ADR-0025).                                                                                                                                                                                                           |
| Where the control sits      | On every public submission's page, beside the share row.                                                                                                                                                                                      |
| What the reporter may write | A reason (harmful, not theirs to post, other), a note, a contact email. No account needed.                                                                                                                                                    |

## Design

### 1. Who can file one

- The control is shown on a **public submission**'s page to every reader but
  its owner. An approver sees it too, beside their "Review this submission"
  link: until stage 4 approvers are the only readers there are, and they must
  be able to try the whole path in production.
- The action takes no session. A signed-in reader's account is used only to
  key their rate limit.
- **Until stage 4**, the action refuses anyone
  `mayUseCommunity` refuses, signed out or not, with the same `FORBIDDEN`
  every other submission action answers. Stage 4 changes that one answer and
  the anonymous path opens with it; nothing here has to move.
- A banned account is refused.
- A report against a submission that is not public (a draft, awaiting
  approval, rejected, deleted, a banned owner's, or an id that names nothing)
  is **accepted in appearance and not stored**. The answer never says whether
  an address names a submission.

### 2. Data model — `prisma/schema.prisma`

Additive only.

```prisma
enum SubmissionReportReason {
  HARMFUL
  NOT_THEIRS
  OTHER
}

model SubmissionReport {
  id           String                 @id @default(auto()) @map("_id") @db.ObjectId
  submissionId String                 @db.ObjectId
  submission   Submission             @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  reason       SubmissionReportReason
  note         String                 @default("") // plain text
  contactEmail String? // admins only; erased 90 days after filing
  handled      Boolean                @default(false)
  handledAt    DateTime?
  handledBy    String?                @db.ObjectId
  createdAt    DateTime               @default(now())

  @@index([submissionId, createdAt])
  @@index([handled, createdAt])
}
```

- `handled` is a non-null boolean with a default, so "open" is matched by
  value and no query needs the null-or-absent filter
  (`docs/lessons/prisma-mongo/`).
- **Nothing identifies the reporter** (ADR-0028): no account id, no
  fingerprint, no address. The only personal data a report can hold is the
  contact email its reporter chose to leave.
- Deleting a submission deletes its reports.

### 3. Limits

Named constants in `src/lib/constants/submissions.ts` and
`src/lib/utils/submission-report-rate-limit.ts`.

| Limit                                      | Value           | On breach                               |
| ------------------------------------------ | --------------- | --------------------------------------- |
| Reports by one reporter on one submission  | 1 per 24 hours  | `LIMIT_EXCEEDED`, "already reported"    |
| Reports by one reporter across submissions | 5 per 24 hours  | `LIMIT_EXCEEDED`, "try again tomorrow"  |
| Notices about one submission               | 3 per 24 hours  | The report is stored; no notice is sent |
| Open reports held against one submission   | 50              | Accepted in appearance, not stored      |
| Note length                                | 1,000           | `VALIDATION` on the note                |
| Note length when the reason is "other"     | at least 10     | `VALIDATION` on the note                |
| Contact email                              | a valid address | `VALIDATION` on the email               |
| Days a contact email is kept               | 90              | Erased by the hourly check              |

- **A reporter** is the signed-in account, else the visitor fingerprint hash
  (`computeFingerprintHash`: user agent, language and the address's network
  prefix), the key the chat abuse report already uses. It lives in the rate
  limiter for 24 hours and nowhere else.
- The limiters follow `abuse-report-rate-limit.ts`: Upstash with the
  in-memory fallback, skipped under `E2E_MODE`.
- The limits are checked only after the submission is found public, so a
  limit's answer cannot be used to probe an address.
- The cap of 50 exists so a many-address attacker cannot grow one
  submission's list without bound. Approvers already hold 50 reasons to look.

### 4. Layers

- **Fragments** `src/lib/repositories/_internal/submission-report-where.ts`:
  `open` and `contactFiledBefore(cutoff)`, proved on Docker Mongo by a
  contract spec beside it.
- **Repository** `src/lib/repositories/submission-report-repository.ts`: the
  only Prisma access. Read models in
  `src/lib/types/domain/submission-report.ts`, each bound to its `select`
  with an `AssertExact` drift guard. The Reported tab's read groups open
  reports by submission; it gets its own contract spec.
- **Rate limit** `src/lib/utils/submission-report-rate-limit.ts`.
- **Service** `src/lib/services/submission-report-service.ts`: every rule in
  this document. Throws `SubmissionRuleError`, as the submission service does.
- **Server Actions**:
  - `src/lib/actions/file-submission-report-action.ts`, marked
    `// action-gate: public`, validating with Zod
    (`src/lib/validation/submission-report-schema.ts`) and verifying the
    Turnstile token before the service is called.
  - `src/lib/actions/submission-report-actions.ts`:
    `markSubmissionReportHandledAction`, crossing `gateAction('approver')`.
- **Notices** `notifyApproversOfReport` in
  `src/lib/services/submission-notices.ts`.
- **Erasure** `src/lib/services/submission-report-contact-erasure.ts`, started
  from `src/instrumentation.ts` beside the overdue reminder.

### 5. Filing a report

In order, once the wire shape and the Turnstile token have passed:

1. Read the submission with its owner. Not public: answer success, store
   nothing.
2. Spend the reporter's two limits. Either refused: `LIMIT_EXCEEDED` with its
   message.
3. The submission already holds 50 open reports: answer success, store
   nothing.
4. Store the report: the reason, the trimmed note, the lower-cased contact
   email or none.
5. Spend the submission's notice limit. Allowed: notify approvers. A failed
   notice is logged and never fails the report.

### 6. Notices

- To **every approver**: an email, and a text to those who opted in to SMS,
  through the same senders the awaiting-approval notice uses. A manager who
  owns the reported submission is left out (section 8).
- The notice names the submission's title and the reason, in the label's own
  words ("reported as harmful"), and links to its review page. It **never
  carries the note or the contact email**: nothing a stranger typed is mailed
  or texted to anyone.
- Under `E2E_MODE` nothing is emailed or texted, as today.

### 7. The report control and its dialog

A "Report" button (a flag icon) at the end of the share row, opening a
dialog. The dialog's code, the form library and the Turnstile script load
when the button is first pressed, not with the page.

React Hook Form, Zod through `zodResolver`. Fields in order:

1. **Reason**, a radio group, none chosen at first:
   - "It's harmful": hate, harassment, threats or worse.
   - "It isn't theirs to post": it is mine, or it shows me, and I did not
     agree.
   - "Something else".
2. **Note**, a textarea. Label "What should we know?". Optional unless the
   reason is "Something else".
3. **Email**, optional. Help: "Only if you want a reply. Only our admins can
   see it, and we erase it after 90 days."
4. Turnstile widget, then "Cancel" and "Send report".

Copy:

- Dialog description: "Tell our team what is wrong. A person reads every
  report. A report does not take this down by itself."
- After sending, in place of the form: "Thanks. Our team has your report."
  with a "Close" button.
- The Turnstile token is single use; a refused send asks for verification
  again, as the submission form does.

### 8. The approver section

- **Review page** `/admin/community/<id>`: under the decision, a "Reports"
  section when the submission has any. Open reports first, then handled, each
  newest first. A report shows its reason, when it was filed, its note as
  plain text, and its contact: the address as a mail link for an admin; "A
  contact email was left. Ask an admin to reply." for a manager; nothing when
  none is held. An open report has a "Mark handled" button; a handled one
  reads "Handled <date> by <username>".
- **Reported tab** `/admin/community?status=reported`: every submission with
  an open report, the one with the oldest open report first. Columns: picture,
  title, owner, state, open reports, oldest report. The tab's label carries
  the count when it is not zero.
- **Dashboard** `/admin` (admins): the Community tile warns "N open reports"
  with a link to the Reported tab, when N is not zero.
- **Marking handled** changes the report and nothing else. Marking a report
  that is already handled succeeds and changes nothing, so two approvers
  pressing at once both get a quiet success.
- **Rejecting a submission** marks every open report on it handled, by the
  rejecting approver. A failure there is logged and never fails the
  rejection.
- **A manager's own submission.** A manager cannot decide on their own
  submission (ADR-0025), and for the same reason is not shown the reports
  against it, cannot mark them handled, does not receive their notices, and
  does not see it in the Reported tab. A report's note can name its reporter.
  An admin is shown everything, their own included, so a label with one admin
  is not stuck.

### 9. Erasing contact emails

- Every hour, in real production only, every report filed more than 90 days
  ago that still holds a contact email has it set to none. The report stays.
- The write is the same whoever runs it, so instances need no claim.
- After erasure a report reads as one with no contact left.

### 10. Edge cases

- The owner edits a reported submission: it goes offline and back for
  approval as always. Its open reports stay open, so the approver who reviews
  the edit sees them on the review page.
- The owner deletes a reported submission: its reports go with it.
- The owner is banned after a report: the submission is not public, so no new
  report is stored; the open ones stay in the Reported tab.
- The same person reports from two networks: two reporters, as far as the
  limiter can tell. The notice limit and the cap of 50 are what bound that.
- Redis is unreachable: each limit falls back to a per-process window, as the
  chat abuse report's does. Reporting is never blocked by an outage.
- A report is filed while an approver has the review page open: it is there
  on the next load. A decision is not refused because a report arrived.

### 11. Acceptance criteria

1. A reader of a public submission's page who is not its owner sees a Report
   control beside the share row; its owner does not, and an unapproved
   submission's page shows none.
2. Sending the dialog with a reason stores one report against that
   submission, open, with the trimmed note and the lower-cased contact email,
   and shows the thanks message.
3. A report with no reason, a note over 1,000 characters, an "other" reason
   with a note under 10 characters, or a malformed email is refused on its
   field and stores nothing.
4. A report without a passing Turnstile token is refused and stores nothing.
5. A report stores nothing that identifies its reporter.
6. A report against a submission that is not public, or an id that names
   none, answers success and stores nothing.
7. Until stage 4, the action answers `FORBIDDEN` to a signed-out caller and
   to a signed-in user who is not an approver, and to a banned account
   always.
8. A reporter's second report on one submission within 24 hours is refused
   with a message saying it was already reported; a sixth report across
   submissions is refused with a message to try again tomorrow. Neither
   stores anything.
9. A report on a submission that already holds 50 open reports answers
   success and stores nothing.
10. Each stored report sends every approver one email, and one text to each
    who opted in, naming the title and the reason and never the note or the
    contact email. The fourth report on one submission within 24 hours is
    stored and sends nothing.
11. A failed notice never fails the report.
12. A report never changes its submission: the submission is still public,
    approved and at the same `updatedAt` after any number of reports.
13. The review page lists a submission's reports, open first. An admin sees
    a left contact email; a manager sees only that one was left.
14. An approver marks an open report handled; it records who and when, and
    the submission is unchanged. Marking it again succeeds and changes
    nothing. A user who is not an approver is refused.
15. Rejecting a submission marks all its open reports handled by that
    approver.
16. The Reported tab lists exactly the submissions with an open report,
    oldest open report first, with each one's open count, and its label
    carries the count.
17. A manager is not shown the reports against their own submission, cannot
    mark them handled, is not sent their notices and does not see that
    submission in the Reported tab. An admin is.
18. The admin dashboard's Community tile shows the number of open reports
    when there are any.
19. A contact email on a report filed more than 90 days ago is erased by the
    check; one filed 89 days ago is not; the reports themselves stay.
20. Deleting a submission deletes its reports.

### 12. Testing (TDD, per repo rules)

- Schema specs for the wire shape, one case per refusal in criterion 3.
- Rate-limit specs in the pattern of `abuse-report-rate-limit.spec.ts`.
- Service specs first, one per step of section 5, then listing, handling,
  the manager's-own rule and erasure.
- A contract spec on Docker Mongo for the two fragments, with a row for each
  way `contactEmail` is stored (absent, null, set).
- A contract spec for the Reported tab's grouped read: order, counts,
  paging, and a manager's own submission left out.
- Action specs: the public action's pre-launch refusal, Turnstile, the
  mapping of each service refusal; the handled action's gate.
- `scripts/check-server-action-gates.spec.ts` pins one more public module.
- Component specs for the control, the dialog and the report list.
- One E2E case in `e2e/tests/community-submissions.spec.ts`: a manager
  reports another manager's approved submission, the second approver finds
  it in the Reported tab, reads the note, marks it handled, and the
  submission is still public.

### 13. Out of scope

- A signed-out visitor end to end. No one signed out can open a submission's
  page until stage 4, which adds that E2E case when it lifts the gate.
- Replying to a reporter from the site. An admin replies from their own
  mail.
- Telling the owner their submission was reported. They are told only if it
  is rejected, with the approver's reason.
- Reports against a user, an attachment alone, or anything but a submission.
- `/community`, search, rows (stage 4); views and Trending (stage 5).

## Implementation constraints (repo rules that will bite here)

- A public Server Action is the one place the action gate is not crossed:
  the marker line, the pin in `check-server-action-gates.spec.ts`, and a
  security review of the whole path before it is called done.
- A new `where` is not committed until its contract case passes on Docker
  Mongo (`pnpm run test:db`).
- The dialog imports the wire schema and the constants, so neither may
  import a `server-only` module
  (`docs/lessons/react-nextjs/client-reachable-modules-must-not-import-server-only.md`).
- No checkbox in the dialog; the reason is a radio group
  (`src/app/AGENTS.md`).
- The schema change is additive, so the deploy's `schema-push` job applies
  it (ADR-0012) and a one-step rollback stays safe (ADR-0021).

## As built (2026-11-12)

Stage 3 is implemented on `feat/submission-reports`. Where the build differs
from the design above, the build is what the code does and this section says
why. The acceptance criteria were not changed.

### Decisions made while building, not yet confirmed by the owner

- **Nothing identifies the reporter** (ADR-0028). The chat abuse report
  stores an account id and a fingerprint; a submission report stores
  neither. The cost is that a harassing reporter can be slowed by the limits
  and never singled out.
- **A manager is kept from the reports against their own submission**: not
  shown them, not sent their notices, not able to mark them handled, and not
  shown that submission in the Reported tab. An admin is shown everything.
- **A cap of 50 open reports per submission.** Past it a report reads as
  sent and is not stored.
- **"Something else" needs a note** of at least ten characters.
- **The notice names the reason** ("reported as harmful") beside the title.
  It still never carries the note or the contact email.
- **The Report control is shown to approvers too**, on a public submission's
  own page, and to every reader but its owner. It is not shown on the
  approver's review page, where the decision is.

### Differences from the design

- **Section 4, the approver lookup.** `UserRepository.findApprovers` now
  returns each approver's role, so the notice can leave out a manager who
  owns the submission and keep an admin who does.
- **Section 4, the limiter module.** It keeps one small tier table and one
  `spend` helper for all three limits, where the chat abuse limiter has a
  getter per tier.
- **Section 7, the button.** Report and Mark handled are disabled until the
  page has hydrated. A press before that would be lost, and the E2E spec's
  click waits on it.
- **Section 7, the dialog.** Each press of Report opens a new dialog, so a
  reporter who returns to it after sending starts from an empty form.
- **Section 8, marking a manager's own.** A manager who calls the action for
  a report on their own submission is answered "Report not found", the same
  as for a report that does not exist.
- **Section 8, the tab's count.** On the Reported tab the count is the
  page's own total; on the other tabs it is one grouped read.
- **The verification hook.** `useVerification` moved out of the submission
  form into `use-verification.ts`, so the form and the dialog share it.

### How it was checked

- **Unit**: 18,129 tests in 1,088 files, with typecheck, lint and format;
  the coverage check passes (branches 95.17% against a 95% floor).
- **Real database**: 38 contract files on Docker Mongo. Two are new: the
  fragments, with a row for each way a contact email is stored and a
  submission's delete taking its reports with it; and the Reported tab's
  grouped read, for its order, counts, paging, total, and one owner's
  submissions left out. That read's relation filter inside `groupBy` was
  the part most likely not to work on MongoDB, and it does.
- **End to end**: one new case in `community-submissions.spec.ts`. A manager
  reports another manager's approved submission; the stored row holds
  nothing about who filed it; the owner sees no trace of it; a second
  approver finds it under Reported, reads the note and not the address; an
  admin reads the address; marking it handled clears it; the submission's
  state and `updatedAt` never change. It passed 3 times across 4 workers on
  the dev server and once on a local production build.

- **Security review**: an independent read of the whole branch, the public
  action first, found nothing it would raise. It traced who can call each
  action and reach each read, where the note and the contact email can
  travel, what a client can shape in a query, and what each answer reveals
  about an id. One thing below its bar was closed anyway: a contact address
  with `?` or `&` before its `@` could have added fields to an admin's mail
  draft, so the mail link now encodes it.

### Known gaps

- **One older unit spec failed once in four full runs** and passed alone and
  on every rerun: `use-attachment-uploads.spec.ts`, "leaves the other files
  alone when one of them fails". This branch does not touch it or the hook.
  The failed run showed both files carrying the second file's message. Not
  investigated further.

- **No signed-out reporter has been through it.** The action's anonymous
  path is covered by its unit spec with the community opened by a mock.
  Until stage 4 nobody signed out can open a submission's page, and the
  action refuses them. Stage 4 adds the E2E case when it lifts the gate.
- **The limits are not exercised end to end.** They are skipped under
  `E2E_MODE`, as the chat abuse limits are, and proved by unit specs against
  a stubbed limiter and the in-memory fallback.
- **Erasure has not run on real data.** The fragment it writes through is
  proved on Docker Mongo; the hourly check starts only in real production.
- **A not-stored report answers a little faster than a stored one.** The
  answer's body is the same. Closing the timing difference was judged not
  worth a delay on every report.
- **Stage 1's and stage 2's gaps still stand**, the real 404 for
  `/community/<id>` among them. They are stage 4's to close.
