# Feature Specification: Stripe Pay-What-You-Want Purchase

**Feature Branch**: `003-stripe-pwyw-purchase`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "Integrate stripe with purchase suggested or pay-what-you-want price: present payment dialog autofilled with user-selected price, handle account creation for new users requiring only email, support logged-in users bypassing email entry, record purchase in database associated with user account, allow returning users up to 5 free downloads before locking with support contact message, send email confirmation with download link upon successful purchase"

## Clarifications

### Session 2026-03-21

- Q: How should the webhook endpoint verify that incoming payment events genuinely originate from Stripe? → A: Stripe webhook signature validation + restrict to Stripe's published IP ranges
- Q: How should download file access be controlled after purchase? → A: Authenticated access — user must be signed in; email link prompts sign-in if not authenticated, then initiates download
- Q: If a user who already owns a release attempts to purchase it again, what should happen? → A: Block it — system prevents re-purchase; download button goes directly to download for already-owned releases
- Q: How should the webhook handler behave when it receives a duplicate event for a payment already processed? → A: Log and skip — if purchase record already exists for that payment ID, ignore the duplicate and log a warning
- Q: When should the user see the success message and be given the download link — on browser-level payment confirmation or after the server-side webhook records the purchase? → A: Hybrid — show "payment received" immediately on client confirmation with a progress indicator; hold the download link until the webhook confirms and the purchase is recorded

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Logged-In User Purchases a Release (Priority: P1)

A fan who is already signed in to the site taps "Download" on a release they haven't purchased yet. Because they are authenticated, the system skips the email entry step and immediately presents the payment dialog pre-filled with the release's suggested price. The user may keep the suggested price or enter any amount they choose (pay-what-you-want). They complete payment through Stripe's secure checkout and, upon success, receive a download confirmation email and immediate access to the download.

**Why this priority**: This is the most direct path to revenue and the simplest purchase flow. Authenticated users represent returning supporters; removing friction (no email prompt) increases conversion. This story delivers a complete, testable payment loop.

**Independent Test**: Can be fully tested by logging in as an existing user, navigating to a release with a suggested price, clicking Download, completing payment in the Stripe-embedded dialog at the pre-filled amount, verifying the "payment received" progress indicator appears, waiting for the download link to appear once the purchase is confirmed, and verifying a confirmation email is sent.

**Acceptance Scenarios**:

1. **Given** a logged-in user who has not purchased release X, **When** they click "Download" on release X, **Then** the payment dialog opens immediately (no email prompt) with the suggested price pre-filled in the amount field.
2. **Given** the payment dialog is open, **When** the user changes the amount to a custom value equal to or greater than the minimum allowed amount, **Then** the Stripe checkout reflects the updated amount.
3. **Given** the payment dialog is open with a valid amount, **When** the user completes payment through Stripe, **Then** a "payment received" message with a progress indicator is shown immediately in the dialog; once the server confirms the purchase (via webhook), the dialog updates to show the download link, and a confirmation email is sent to the user's registered address.
4. **Given** a logged-in user who has already purchased release X, **When** they click "Download" on release X, **Then** the download begins immediately without presenting any payment dialog (see User Story 3).

---

### User Story 2 — Guest User Purchases a Release (Priority: P2)

A fan who is not signed in taps "Download" on a release. They are presented with a step-by-step flow: first, they enter their email address; then if no account with that email exists, a lightweight account is created for them automatically. The payment dialog then appears pre-filled with the suggested price. After completing payment, the purchase is recorded to their new (or existing) account and they receive a confirmation email with the download link.

**Why this priority**: Guest purchase is the primary acquisition path for new supporters. It must be frictionless — just an email plus payment. This story builds on the payment infrastructure from P1 but adds the account-lookup-and-creation step.

**Independent Test**: Can be fully tested by logging out, clicking Download on any release, entering a brand-new email address, completing payment, and verifying: (a) a new account was created, (b) the purchase is recorded to that account, (c) a confirmation email is sent, and (d) the download link in the email works.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user clicks "Download" on a release, **When** the dialog opens, **Then** an email input field is shown as the first step before any payment options.
2. **Given** the user enters an email address that does not match any existing account, **When** they proceed, **Then** a new account is created with that email address and the user is effectively signed in for this session; the payment dialog then appears pre-filled with the suggested price.
3. **Given** the user enters an email address that matches an existing account, **When** they proceed, **Then** no duplicate account is created; the purchase is associated with the existing account; the payment dialog appears pre-filled with the suggested price.
4. **Given** the user enters an invalid email format, **When** they attempt to proceed, **Then** an inline validation error is shown and no account creation is attempted.
5. **Given** a guest enters valid email and the payment dialog appears, **When** they complete payment, **Then** an immediate "payment received" message with a progress indicator is shown; once the webhook confirms the purchase, the dialog updates to show the download link and a confirmation email is sent to the entered address.

---

### User Story 3 — Returning Purchaser Downloads Without Re-Paying (Priority: P3)

A fan who previously purchased a release returns to download it again. When they click "Download," the system recognizes them (by their account) as a prior purchaser and grants them immediate access — no payment prompt. This free re-download access is capped at 5 total downloads. After the 5th download, the download button is disabled and a message directs them to contact support for additional access.

**Why this priority**: Re-download access is a core supporter benefit. It requires the purchase recording from P1/P2 to exist, making it naturally dependent. It must be in place before launch to prevent purchasers from feeling locked out.

**Independent Test**: Can be fully tested by purchasing a release as a logged-in user (P1), then clicking Download again — the download should start without a payment prompt. Repeating this 5 times should trigger the support-contact lock message on the 6th attempt.

**Acceptance Scenarios**:

1. **Given** a logged-in user who has previously purchased release X, **When** they click "Download" on release X and their download count for this release is fewer than 5, **Then** the download starts immediately with no payment dialog and the download count increments by 1.
2. **Given** a logged-in user who has purchased release X and has already downloaded it 5 times, **When** they view release X, **Then** the Download button is visually disabled and a message is displayed directing them to contact support for additional access.
3. **Given** a returning guest user (matching email from previous purchase) clicks Download on a purchased release, **When** they enter their email in the email step, **Then** the system identifies the prior purchase, skips payment, and grants download access (subject to the 5-download cap).

---

### User Story 4 — Purchase Confirmation Email (Priority: P4)

Upon a successful payment, the purchaser receives an email confirmation thanking them for supporting Fake Four Inc. and providing a link to access their download. The email is sent automatically and does not require any action from the purchaser beyond completing payment.

**Why this priority**: The confirmation email is a key trust signal and provides a durable link to the download for the user. It depends on payment completion (P1/P2) and is a self-contained addition to the post-payment flow.

**Independent Test**: Can be fully tested after completing a purchase (P1 or P2), by checking the recipient's inbox for the confirmation email, verifying the copy includes a thank-you message referencing Fake Four Inc., and confirming the download link resolves and initiates the download.

**Acceptance Scenarios**:

1. **Given** a purchase is successfully completed, **When** Stripe confirms the payment, **Then** a confirmation email is sent to the purchaser's email address within a reasonable time (within 2 minutes of payment confirmation).
2. **Given** the confirmation email is sent, **When** the recipient opens it, **Then** the email contains: a thank-you message referencing Fake Four Inc., the name of the release purchased, and a link to access/download the release.
3. **Given** the download link in the confirmation email, **When** the recipient clicks it, **Then** if they are already signed in their download begins immediately (subject to the 5-download cap); if they are not signed in they are redirected to the sign-in page and, upon successful authentication, the download proceeds.
4. **Given** a payment fails (card declined, timeout, etc.), **When** the failure occurs, **Then** no confirmation email is sent and the user sees an appropriate error message within the payment dialog.

---

### Edge Cases

- What happens if Stripe's webhook is delayed after the user sees "payment received"? → The progress indicator in the dialog continues to show; the download link is withheld until the webhook arrives and the purchase is recorded. The user should be told to check their email if they need to leave, as the confirmation email will also contain the download link once the webhook completes.
- What happens if the webhook never arrives (e.g., Stripe delivery failure) after the user has seen "payment received"? → After a defined timeout period, the dialog should display a message telling the user their payment was received but access is still being processed, directing them to check their confirmation email or contact support if the issue persists.
- What happens if the user closes the payment dialog mid-flow before completing payment? → No account is created (for guests), no purchase is recorded, and the dialog closes cleanly. The download button returns to its normal unpurchased state.
- What happens if a guest user's email already exists but they are not signed in and they enter that email? → The system looks up the existing account, associates the purchase with it (no duplicate account created), and sends confirmation to that email address.
- What happens if the minimum amount entered is below a floor (e.g., $0.50 Stripe minimum)? → The system enforces a minimum purchase amount and shows a clear error message if the user enters too low an amount.
- What happens if the download link (from Release.downloadUrls) is empty or broken? → The system should degrade gracefully — either show a "download not available" message or direct the user to support rather than providing a broken link.
- What happens if the confirmation email fails to send? → The purchase is still recorded and the download is still granted. A retry should be attempted; if all retries fail, the error is logged for admin review. The download link from the success screen remains available to the user.
- What happens if a new user's account creation fails (e.g., database error)? → The payment should not proceed until the account can be created. The user sees a clear error and the payment dialog is not opened.
- What happens if an authenticated user's download count has reached 5 but they attempt to use the confirmation email link? → The link resolves to the release page where the disabled button and support message are displayed.
- What happens if Stripe re-delivers the same payment event twice (at-least-once webhook delivery)? → The webhook handler checks the transaction ID against existing purchase records; if a match is found, the duplicate event is skipped (no second record, no second email) and a warning is written to the application log.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST display a "Download" button on each published release that grants one-time payment access to the release's downloadable files.
- **FR-002**: When an authenticated user clicks "Download" on a release they have not purchased, the system MUST open a payment dialog without prompting for an email address.
- **FR-003**: When an unauthenticated user clicks "Download," the system MUST first display an email input step before the payment dialog to collect the user's email address.
- **FR-004**: The email input step MUST validate the format of the entered email address and prevent progression to the payment step if the format is invalid.
- **FR-005**: If the entered email matches an existing user account, the system MUST associate the pending purchase with that existing account and MUST NOT create a duplicate account.
- **FR-006**: If the entered email does not match any existing user account, the system MUST create a new user account with that email address before proceeding to the payment dialog.
- **FR-007**: The payment dialog MUST be pre-filled with the release's suggested price as the default amount.
- **FR-008**: The payment dialog MUST allow the user to change the amount to any value at or above the enforced minimum purchase amount (accounting for payment processor minimums).
- **FR-009**: Payment MUST be processed as a one-time charge (not a subscription) through Stripe's secure checkout flow embedded within the dialog.
- **FR-010**: Upon successful payment confirmation from Stripe, the system MUST create a purchase record in the database associating the user account with the purchased release, including a timestamp and the amount paid.
- **FR-011**: Upon browser-level payment confirmation, the system MUST immediately display a "payment received" message with a progress indicator within the dialog. The download link MUST NOT be shown until the server-side webhook has confirmed the payment and recorded the purchase. Once the purchase record is confirmed, the dialog MUST update to show the download link and the user may proceed to download.
- **FR-012**: Upon server-side webhook confirmation of a successful payment, the system MUST send a confirmation email to the purchaser's email address containing: a thank-you message referencing Fake Four Inc., the release title, and a link to access the download.
- **FR-013**: When a logged-in user who has previously purchased a release clicks "Download," the system MUST grant immediate download access without presenting a payment dialog, provided their download count for that release is fewer than 5.
- **FR-014**: The system MUST track a per-user, per-release download count that increments by 1 each time a prior purchaser accesses the download.
- **FR-015**: When a prior purchaser's download count for a release reaches or exceeds 5, the system MUST display the Download button in a disabled state with a message directing the user to contact support for additional access.
- **FR-016**: A returning guest user (not currently signed in) who previously purchased a release MUST be able to re-access the download by entering their email in the email step; the system MUST then recognize their prior purchase and skip the payment step (subject to the 5-download cap).
- **FR-017**: If the Stripe payment fails (card declined, network error, etc.), the system MUST display a clear, user-friendly error message within the payment dialog and MUST NOT record a purchase or send a confirmation email.
- **FR-018**: The purchase flow MUST NOT allow the user to proceed to checkout if account creation fails for a new guest user.
- **FR-019**: The download link provided to the user (in-session and via confirmation email) MUST require the user to be authenticated. If the user is not signed in when following the link, the system MUST redirect them to sign in (using their purchase account email) before initiating the download. Once authenticated, the download proceeds subject to the 5-download cap.
- **FR-020**: The webhook endpoint that receives payment confirmation events MUST reject any request that fails Stripe's webhook signature validation. Additionally, the endpoint MUST only accept requests originating from Stripe's published IP address ranges; requests from all other IP addresses MUST be rejected with a 403 response.
- **FR-021**: The system MUST prevent a user from purchasing a release they already own. If an authenticated user who has a prior purchase record for a release attempts to initiate payment, the system MUST skip the payment dialog and grant direct download access instead. Each user-release purchase relationship MUST be unique.
- **FR-022**: The webhook handler MUST be idempotent. If a payment event arrives for a transaction ID that already has a corresponding purchase record, the system MUST skip all processing (no duplicate record, no duplicate email), return a 200 response to Stripe, and write a warning entry to the application log.

### Key Entities

- **Release**: A published musical release with a title, cover art, suggested price, and one or more downloadable file URLs. The central entity for the purchase flow.
- **User**: A person with an email address and account record. May be pre-existing (signed in or guest with prior account) or newly created during the guest purchase flow. Associated with purchases and download access records.
- **ReleasePurchase**: A record linking a User to a Release, capturing the fact of purchase. Key attributes: user reference, release reference, amount paid, payment processor transaction reference (used as the idempotency key to detect duplicate webhook events), and purchase timestamp. Each user-release pair is unique — a user may only have one purchase record per release.
- **ReleaseDownload**: A record tracking each time a prior purchaser accesses a release download. Key attributes: user reference, release reference, download timestamp, and a running count per user-release pair used to enforce the 5-download cap.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Authenticated users can complete the full purchase flow — from clicking "Download" to receiving a confirmation email — in under 3 minutes.
- **SC-002**: Guest users can complete the full purchase flow — including email entry, account creation, and payment — in under 5 minutes.
- **SC-003**: 100% of successful payments result in a purchase record being created in the database and a confirmation email being dispatched.
- **SC-004**: 0% of failed or cancelled payments result in a purchase record or confirmation email being created.
- **SC-005**: Returning purchasers receive immediate download access (no payment dialog) on all download attempts before reaching the 5-download cap.
- **SC-006**: The download count limit is enforced consistently: on the 6th download attempt, 100% of prior purchasers see the disabled button and support contact message rather than a payment prompt or successful download.
- **SC-007**: No duplicate user accounts are created when a guest enters an email address matching an existing account.
- **SC-008**: The payment dialog pre-fills the suggested price on 100% of dialog openings where a suggested price is defined for the release.
- **SC-009**: Confirmation emails are delivered within 2 minutes of payment confirmation on successful purchases.
- **SC-010**: The purchase flow renders and functions correctly on mobile devices (viewport 320px–768px) with no layout overflow, inaccessible controls, or broken steps.

## Assumptions

- **Suggested price field**: The `Release` model will need a `suggestedPrice` field (in cents/integer) to store the pre-filled default amount. This field is currently absent from the schema and will need to be added.
- **Minimum purchase amount**: The enforced minimum purchase amount follows Stripe's minimums (currently $0.50 USD). The system will reject amounts below this threshold.
- **Pay-what-you-want floor**: There is no business-defined minimum above Stripe's floor unless specified later. Users can pay the suggested amount or more.
- **Download URLs**: The release's `downloadUrls` array (already in the schema) stores the actual file download links. At least one URL must exist for the download feature to function.
- **Stripe payment type**: A one-time charge (not a recurring subscription). The user is billed once per release purchase, regardless of any existing subscription status they may have.
- **New database models required**: Two new models are needed — `ReleasePurchase` and `ReleaseDownload` — as neither exists in the current schema.
- **Email delivery**: The existing email infrastructure (used for subscription confirmation) will be reused or extended for purchase confirmation emails.
- **Guest account password**: Newly created guest accounts are passwordless stubs (email-only). Users can claim/set a password later through the existing account management flow. These accounts should not be flagged as "verified" until email confirmation occurs.
- **Session handling for new accounts**: When a new account is created for a guest user during the purchase flow, the user is considered authenticated in the current session for the purpose of completing the purchase and accessing the download, but a formal sign-in session is not necessarily persisted.
- **Download link in email**: The confirmation email download link requires authentication. Unauthenticated recipients are redirected to sign in before the download is served. This ensures the 5-download cap is correctly enforced and prevents link sharing.
- **Download count scope**: The 5-download cap is per user per release. A user can download different releases without their counts affecting each other.
- **Admin override**: The 5-download cap is enforced at the application level. Admins or support staff can assist users who exceed the cap through existing support channels (not in scope for this feature).

## Scope & Boundaries

### In Scope

- Payment dialog UI triggered from the release download button
- Email collection step for unauthenticated users
- New account creation (email-only stub) for first-time purchasers
- Existing account lookup to prevent duplicate accounts
- Stripe one-time payment processing embedded in the dialog
- Pre-filling the suggested price in the payment dialog
- Pay-what-you-want amount entry with minimum enforcement
- Purchase record creation in the database upon payment confirmation
- Immediate download access upon successful payment
- Per-user, per-release download count tracking
- 5-download cap with disabled button and support message for returning purchasers
- Purchase confirmation email with thank-you message and download link
- Stripe webhook handling for payment success/failure events
- Adding `suggestedPrice` field to the Release data model
- New `ReleasePurchase` and `ReleaseDownload` data models

### Out of Scope

- Subscription billing or recurring payments
- Refunds or dispute handling (handled through Stripe dashboard)
- Admin UI for viewing or managing purchases
- Download analytics or reporting dashboards
- Social sharing of purchases
- Gift purchases (buying on behalf of another user)
- Physical merchandise or shipping
- Multiple download format selection (the feature uses existing `downloadUrls` as-is)
- Password creation or full account setup during the guest purchase flow
- Email verification for newly created guest accounts (deferred to account management)
- Admin override of the 5-download cap through the UI (handled via support)
- Stripe Connect or marketplace functionality
