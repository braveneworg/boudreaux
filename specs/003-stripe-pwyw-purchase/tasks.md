# Tasks: Stripe Pay-What-You-Want Purchase

**Input**: Design documents from `/specs/003-stripe-pwyw-purchase/`
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓, research.md ✓, contracts/api.md ✓, quickstart.md ✓

**Tests**: Required per constitution Principle III (NON-NEGOTIABLE). Test tasks are in Phase 8 (T031–T040). Per TDD practice, write tests before or alongside implementation tasks.

**Organization**: Tasks grouped by user story for independent implementation and delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US4) — maps to spec.md priorities P1–P4
- Exact file paths included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, constants, and environment configuration that block all user stories

- [x] T001 Update `prisma/schema.prisma` — add `ReleasePurchase` model (id, userId, releaseId, amountPaid, currency, stripePaymentIntentId @unique, stripeSessionId, confirmationEmailSentAt, purchasedAt, @@unique([userId,releaseId])); add `ReleaseDownload` model (id, userId, releaseId, downloadCount, lastDownloadedAt, @@unique([userId,releaseId])); add `suggestedPrice Int?` to `Release`; add `releasePurchases ReleasePurchase[]` and `releaseDownloads ReleaseDownload[]` back-relations to `User`; add `releasePurchases ReleasePurchase[]` and `releaseDownloads ReleaseDownload[]` back-relations to `Release` — per `specs/003-stripe-pwyw-purchase/data-model.md`
- [ ] T002 Run `npx prisma db push` to apply schema changes and create MongoDB indexes; verify `ReleasePurchase` and `ReleaseDownload` collections appear in Prisma Studio (depends on T001)
- [x] T003 [P] Add `export const MAX_RELEASE_DOWNLOAD_COUNT = 5;` to `src/lib/constants.ts` (create file if it does not exist)
- [x] T004 [P] Add `STRIPE_WEBHOOK_IP_RANGES` env var (Stripe webhook CIDR ranges, comma-separated) to `.env.local` and `.env.example`; add `SKIP_STRIPE_IP_CHECK=true` to `.env.local` only with a comment that it must never be set in production — per `specs/003-stripe-pwyw-purchase/quickstart.md`

**Checkpoint**: Schema applied, constants in place — user story work can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data-access and business logic shared by all four user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `src/lib/validation/purchase-schema.ts` — export `purchaseCheckoutSchema` (Zod object: `releaseId: z.string().min(1)`, `amountCents: z.number().int().min(50)`, `userId: z.string().min(1)`, `releaseTitle: z.string().min(1)`) and `amountInputSchema` (Zod: `z.number().int().min(50)` with descriptive error message for below-minimum amounts); include MPL 2.0 license header
- [x] T006 Create `src/lib/repositories/purchase-repository.ts` — export `PurchaseRepository` class with methods: `create(data)` (write `ReleasePurchase`), `findByPaymentIntentId(paymentIntentId)` (idempotency lookup — O(log n) by `stripePaymentIntentId` unique index), `findByUserAndRelease(userId, releaseId)` (existing purchase check), `getDownloadRecord(userId, releaseId)` (fetch `ReleaseDownload`), `upsertDownloadCount(userId, releaseId)` (atomic upsert: increment `downloadCount` + set `lastDownloadedAt = now()`), `markEmailSent(purchaseId)` (atomic `updateMany` with `confirmationEmailSentAt: null` filter — mirrors `SubscriptionRepository.markConfirmationEmailSent` pattern); all methods fully typed with no `any`; include MPL 2.0 license header (depends on T001, T002)
- [x] T007 Create `src/lib/services/purchase-service.ts` — export `PurchaseService` class with methods: `checkExistingPurchase(userId, releaseId): Promise<boolean>` (calls `PurchaseRepository.findByUserAndRelease`), `getDownloadAccess(userId, releaseId): Promise<{allowed: boolean; reason: 'no_purchase'|'download_limit_reached'|null; downloadCount: number}>` (checks purchase existence then `downloadCount < MAX_RELEASE_DOWNLOAD_COUNT`), `incrementDownloadCount(userId, releaseId): Promise<void>` (calls `PurchaseRepository.upsertDownloadCount`); all types explicit; include MPL 2.0 license header (depends on T006, T003)

**Checkpoint**: Foundation ready — all user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Logged-In User Purchases a Release (Priority: P1) 🎯 MVP

**Goal**: An authenticated user clicks Download on an unpurchased release, pays via embedded Stripe checkout, sees a progress indicator while awaiting webhook confirmation, then receives a download link and confirmation email.

**Independent Test**: Log in as an existing user → navigate to a release page with `suggestedPrice` set → click Download → verify payment dialog opens pre-filled → pay with Stripe test card `4242 4242 4242 4242` → verify "payment received" spinner appears → wait for Stripe CLI to forward webhook → verify dialog updates to show download link → click link → verify file download initiates → verify confirmation email received.

### Implementation for User Story 1

- [x] T008 [P] [US1] Create `src/app/components/purchase-checkout-step.tsx` — `'use client'` Client Component; accepts props: `clientSecret: string`, `paymentIntentId: string`, `releaseId: string`, `onConfirmed: () => void`, `onError: (msg: string) => void`; renders `<CheckoutProvider options={{clientSecret}}><PurchaseCheckoutForm .../></CheckoutProvider>`; inner `PurchaseCheckoutForm` uses `useCheckout()` to call `checkout.confirm()`; on `type: 'complete'` shows "Payment received, preparing your download…" + spinner; uses `useQuery` from `@tanstack/react-query` with `refetchInterval: 2000` to poll `GET /api/releases/${releaseId}/purchase-status?paymentIntentId=${paymentIntentId}`; stops polling on `{confirmed: true}` and calls `onConfirmed()`; after 90 s without confirmation shows "still processing" message directing user to check email or contact support; include MPL 2.0 license header
- [x] T009 [P] [US1] Create `src/app/components/purchase-success-step.tsx` — `'use client'` Client Component; accepts props: `releaseId: string`, `releaseTitle: string`; renders a success heading, brief "Thank you for your purchase" copy, a download button that navigates to `GET /api/releases/${releaseId}/download` (opens in same tab triggering the redirect-to-file flow), and a "A confirmation email is on its way" note; include MPL 2.0 license header
- [x] T010 [P] [US1] Create `src/lib/actions/create-purchase-checkout-session-action.ts` — `'use server'` Server Action; validate input with `purchaseCheckoutSchema`; call `PurchaseService.checkExistingPurchase` and return `{success:false, error:'already_purchased'}` if found; call `stripe.checkout.sessions.create` with `mode:'payment'`, `ui_mode:'custom'`, `line_items:[{price_data:{currency:'usd',unit_amount:amountCents,product_data:{name:releaseTitle}},quantity:1}]`, `payment_intent_data:{metadata:{type:'release_purchase',releaseId,userId}}`, `return_url`; return `{success:true, clientSecret, paymentIntentId}` or `{success:false, error:string}` on failure; include MPL 2.0 license header (depends on T005, T007)
- [x] T011 [P] [US1] Create `src/lib/email/purchase-confirmation-email-html.ts` — export `renderPurchaseConfirmationEmailHtml(params: {releaseTitle: string; amountPaidCents: number; downloadUrl: string; recipientEmail: string}): string`; HTML template with subject-matched heading "Thank you for supporting Fake Four Inc.!", release title, formatted amount ("You paid $X.XX"), a prominent "Download Your Music" CTA button linking to `downloadUrl`, and footer; follow existing HTML email template style in `src/lib/email/`; include MPL 2.0 license header
- [x] T012 [P] [US1] Create `src/lib/email/purchase-confirmation-email-text.ts` — export `renderPurchaseConfirmationEmailText(params: {releaseTitle: string; amountPaidCents: number; downloadUrl: string}): string`; plain-text equivalent of T011 with same core content and download URL printed as plain text; include MPL 2.0 license header
- [x] T013 [US1] Create `src/lib/email/send-purchase-confirmation.ts` — export `sendPurchaseConfirmationEmail(input: SendPurchaseConfirmationInput): Promise<void>` where input includes `toEmail`, `releaseTitle`, `releaseId`, `amountPaidCents`, `purchaseId`; construct `downloadUrl` as `${process.env.NEXT_PUBLIC_BASE_URL}/api/releases/${releaseId}/download`; call `PurchaseRepository.markEmailSent(purchaseId)` atomically — if it returns 0 updated records (already sent), return early (idempotency); call SES client with HTML and text bodies from T011/T012; log warning on send failure but do not throw (purchase is already recorded); include MPL 2.0 license header (depends on T006, T011, T012)
- [x] T014 [US1] Create `src/app/api/releases/[releaseId]/purchase-status/route.ts` — `export async function GET(request, {params})`: extract `paymentIntentId` from `request.nextUrl.searchParams`; return `400 {error:'missing_payment_intent_id'}` if absent; call `PurchaseRepository.findByPaymentIntentId(paymentIntentId)`; return `200 {confirmed: !!record}` with `Cache-Control: no-store` header; no authentication required (boolean only, no personal data exposed); include MPL 2.0 license header (depends on T006)
- [x] T015 [US1] Create `src/app/api/releases/[releaseId]/download/route.ts` — `export async function GET(request, {params})`: call `getToken({req:request})` from `next-auth/jwt`; return `401 {error:'unauthenticated'}` if no token; fetch release by `params.releaseId` via existing release repository/service; return `404 {error:'release_not_found'}` if not found or not published; return `404 {error:'no_download_url'}` if `release.downloadUrls` is empty; call `PurchaseService.getDownloadAccess(token.sub, params.releaseId)`; return `403 {error:'no_purchase'}` or `403 {error:'download_limit_reached', downloadCount, maxDownloadCount: MAX_RELEASE_DOWNLOAD_COUNT}` based on result; call `PurchaseService.incrementDownloadCount(token.sub, params.releaseId)`; return `302` redirect to `release.downloadUrls[0]`; include MPL 2.0 license header (depends on T003, T006, T007)
- [x] T016 [US1] Modify `src/app/api/stripe/webhook/route.ts` — (a) add IP allowlist guard as the first check in the POST handler: read `STRIPE_WEBHOOK_IP_RANGES` env var, parse CIDR ranges, extract first IP from `x-forwarded-for` or `x-real-ip` header, return `403` if IP not in any allowlist range (skip check if `SKIP_STRIPE_IP_CHECK === 'true'`); (b) add `handleReleasePurchaseCompleted(session)` function: extract `session.payment_intent` as `paymentIntentId`; call `PurchaseRepository.findByPaymentIntentId(paymentIntentId)` — if found, log warning and return (idempotency); extract `releaseId` and `userId` from `session.metadata`; call `PurchaseRepository.create({userId, releaseId, amountPaid: session.amount_total, currency: session.currency, stripePaymentIntentId: paymentIntentId, stripeSessionId: session.id})`; call `sendPurchaseConfirmationEmail({toEmail, releaseTitle, releaseId, amountPaidCents, purchaseId})`; (c) in the existing `checkout.session.completed` handler dispatch: add `if (session.mode === 'payment' && session.metadata?.type === 'release_purchase')` branch calling `handleReleasePurchaseCompleted(session)` before the existing subscription branch; include MPL 2.0 license header updates (depends on T006, T013)
- [x] T017 [US1] Modify `src/app/components/download-dialog.tsx` — (a) extend `DialogStep` union type to include `'purchase-checkout'`, `'purchase-success'`, and `'returning-download'`; (b) add `purchaseAmountCents` and `purchaseClientSecret` and `purchasePaymentIntentId` to dialog state; (c) in the `'download'` step, for the premium digital option add a numeric amount input (PWYW, pre-filled with `suggestedPrice` prop if provided) validated by `amountInputSchema`; add a "Purchase" button that calls `createPurchaseCheckoutSessionAction`, stores the returned `clientSecret` and `paymentIntentId` in state, and transitions to `'purchase-checkout'`; (d) add rendering for `'purchase-checkout'` step: render `<PurchaseCheckoutStep clientSecret=... paymentIntentId=... releaseId=... onConfirmed={() => setStep('purchase-success')} onError=.../>` (e) add rendering for `'purchase-success'` step: render `<PurchaseSuccessStep releaseId=... releaseTitle=.../>`; accept new props: `releaseId: string`, `releaseTitle: string`, `suggestedPrice: number | null`; include MPL 2.0 license header updates (depends on T008, T009, T010)
- [x] T018 [US1] Modify `src/app/releases/[releaseId]/page.tsx` — fetch `release.suggestedPrice` alongside existing release data; if session exists, call `PurchaseRepository.findByUserAndRelease(session.user.id, releaseId)` to determine `hasPurchase`; pass `releaseId`, `releaseTitle`, `suggestedPrice`, and `hasPurchase` as new props to `<DownloadDialog>`; handle `null` session (unauthenticated) by passing `hasPurchase={false}` (depends on T006, T017)

**Checkpoint**: US1 complete — authenticated user can purchase a release, see progress dialog, receive download link, download the file, and receive a confirmation email

---

## Phase 4: User Story 2 — Guest User Purchases a Release (Priority: P2)

**Goal**: An unauthenticated visitor can purchase a release by entering their email (creating a new account if needed), completing payment, and accessing the download — all without a prior account.

**Independent Test**: Sign out → navigate to a release page → click Download → enter a brand-new email address → verify account is created (check DB / Prisma Studio) → complete payment → verify dialog shows progress → verify download link appears → verify confirmation email sent to entered address.

### Implementation for User Story 2

- [x] T019 [US2] Modify `src/app/components/download-dialog.tsx` — add `purchaseMode` boolean state flag (set to `true` when "Purchase" is initiated from the download step); in the "Purchase" button handler: check `session` state — if authenticated, proceed directly to `'purchase-checkout'` (existing T017 behaviour); if unauthenticated, set `purchaseMode = true` and transition to `'email-step'`; in the `'email-step'` `onSuccess` callback: if `purchaseMode === true`, transition to `'purchase-checkout'` (instead of the existing subscription path which transitions to `'checkout'`); ensure the purchase flow uses `amountCents` + `releaseId` state already set before the email step; in the `'email-step'` `onError` callback (or when `resolveSubscriberAction` returns `{success: false}`): clear `purchaseMode`, display an inline error message ("We couldn't set up your account — please try again."), and remain on `'email-step'` rather than transitioning to `'purchase-checkout'` (FR-018) (depends on T017)

**Checkpoint**: US2 complete — guest user can complete full purchase flow via email entry and account creation

---

## Phase 5: User Story 3 — Returning Purchaser Downloads Without Re-Paying (Priority: P3)

**Goal**: A user who has already purchased a release can download it immediately (no payment prompt), up to 5 times. On the 6th attempt the Download button is disabled with a support contact message.

**Independent Test**: As a prior purchaser, click Download → verify the payment flow is skipped and the file downloads immediately → repeat 5 times → verify the Download button becomes disabled with a support link message → as a signed-out prior purchaser, enter email in the dialog → verify payment is skipped and download is granted (subject to the same cap).

### Implementation for User Story 3

- [x] T020 [US3] Modify `src/app/releases/[releaseId]/page.tsx` — extend the server-side data fetching added in T018 to also call `PurchaseRepository.getDownloadRecord(session?.user.id, releaseId)` when `hasPurchase` is true; derive `downloadCount: number` and `downloadLimitReached: boolean` (= `downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT`); pass both as new props to `<DownloadDialog>`; handle unauthenticated case with `downloadCount: 0` and `downloadLimitReached: false` (depends on T003, T006, T018)
- [x] T021 [US3] Modify `src/app/components/download-dialog.tsx` — accept new props `hasPurchase: boolean`, `downloadCount: number`, `downloadLimitReached: boolean`; in the `'download'` step initial render: (a) if `hasPurchase && downloadLimitReached` → replace the Download area with a disabled "Download" button and a message "You've reached the download limit. Please contact support for help." with a mailto or support link; (b) if `hasPurchase && !downloadLimitReached` → show a "Download" button that calls `GET /api/releases/${releaseId}/download` directly (via `window.location.href` or a link `<a href=...>`) skipping all payment steps; the PWYW purchase option remains visible only when `!hasPurchase` (depends on T015, T020)
- [x] T022 [US3] Modify `src/app/components/download-dialog.tsx` — in the `'email-step'` `onSuccess` callback when `purchaseMode === true`: after `resolveSubscriberAction` resolves with `{status: 'existing'}`, call a new lightweight check `PurchaseService.checkExistingPurchase(resolvedUserId, releaseId)` — if prior purchase found and `!downloadLimitReached`, transition to a temporary `'returning-download'` state that issues a direct download; if prior purchase found and `downloadLimitReached`, transition to a disabled state with support message; if no prior purchase, continue to `'purchase-checkout'` as normal; **important**: `resolveSubscriberAction` returns `{success, status?, error?}` only — it does NOT return a userId; after it resolves with `{success: true}`, retrieve the userId by calling `UserRepository.findByEmail(email)` (the email captured in the email-step); pass the retrieved userId to `PurchaseService.checkExistingPurchase(userId, releaseId)` (depends on T007, T019, T021)

**Checkpoint**: US3 complete — returning purchasers download directly; download cap enforced both in UI and at the API route level

---

## Phase 6: User Story 4 — Purchase Confirmation Email (Priority: P4)

**Goal**: Validate and finalize the confirmation email content: thank-you message referencing Fake Four Inc., release title, amount paid, and an authenticated download link. Verify edge cases (retry safety, failure logging).

**Independent Test**: Complete a purchase → check the confirmation email → verify subject is "Thank you for supporting Fake Four Inc.!", body includes the release title and formatted amount, and the download link points to an authenticated route → click the link while signed out → verify redirect to sign-in page → sign in → verify download proceeds.

### Implementation for User Story 4

- [x] T023 [US4] Review and finalize `src/lib/email/purchase-confirmation-email-html.ts` (created in T011) — verify the template renders: subject heading "Thank you for supporting Fake Four Inc.!", release title, formatted amount (cents converted to dollars, e.g. "$9.99"), a CTA button linked to the authenticated download route, and a footer; ensure download URL format is `${NEXT_PUBLIC_BASE_URL}/api/releases/${releaseId}/download` so authentication is enforced on click (depends on T011)
- [x] T024 [US4] Review and finalize `src/lib/email/purchase-confirmation-email-text.ts` (created in T012) — verify plain-text equivalent matches HTML content with the same download URL and all required copy; ensure no HTML tags appear in the text variant (depends on T012)
- [x] T025 [US4] Review `src/lib/email/send-purchase-confirmation.ts` (created in T013) — verify that: (a) `markEmailSent` check prevents duplicate sends on webhook retry; (b) SES send failure is caught, logged as an error to the application log, and does not re-throw (purchase record stays intact); (c) the function is callable without crashing when `NEXT_PUBLIC_BASE_URL` is set in the environment; manually test by triggering a webhook retry via the Stripe CLI dashboard and confirming no second email is dispatched (depends on T013)

**Checkpoint**: US4 complete — confirmation email content validated; edge cases (duplicate sends, send failures) verified

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Code quality, build verification, and end-to-end validation

- [x] T026 [P] Run `npm run lint:fix` across all new and modified files; fix any ESLint errors in: `src/lib/validation/purchase-schema.ts`, `src/lib/repositories/purchase-repository.ts`, `src/lib/services/purchase-service.ts`, `src/lib/actions/create-purchase-checkout-session-action.ts`, `src/lib/email/send-purchase-confirmation.ts`, `src/lib/email/purchase-confirmation-email-html.ts`, `src/lib/email/purchase-confirmation-email-text.ts`, `src/app/api/releases/[releaseId]/download/route.ts`, `src/app/api/releases/[releaseId]/purchase-status/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/components/download-dialog.tsx`, `src/app/components/purchase-checkout-step.tsx`, `src/app/components/purchase-success-step.tsx`, `src/app/releases/[releaseId]/page.tsx`
- [x] T027 [P] Run `npm run format` (Prettier) across all new and modified files listed in T026
- [x] T028 Run `npm run build` and resolve any TypeScript strict-mode errors across all new files; ensure no `any` types remain; verify return types are explicit on all exported functions (depends on T026, T027)
- [x] T029 Run `npm run test:run` — verify all pre-existing tests pass and all new Phase 8 tests (T031–T040) pass; run `npm run test:coverage` and verify 90–95%+ coverage on all new files listed in T026; investigate and fix regressions in webhook route or page-level prop changes; Phase 8 tests MUST be complete (depends on T028, T040)
- [ ] T030 Validate the full purchase flow end-to-end using the step-by-step walkthrough in `specs/003-stripe-pwyw-purchase/quickstart.md`

---

## Phase 8: Unit & Integration Test Coverage (Constitution Principle III — NON-NEGOTIABLE)

**Purpose**: Achieve 90–95%+ coverage on all new and substantially modified files. Per constitution Principle III, these tests SHOULD be written before or alongside implementation (TDD). All test files use Vitest with jest-dom matchers, adjacent to source, with `.spec.ts` / `.spec.tsx` extension.

- [x] T031 [P] Create `src/lib/validation/purchase-schema.spec.ts` — describe `purchaseCheckoutSchema`: valid input passes; `releaseId` empty string fails; `amountCents` = 49 fails (below min); `amountCents` non-integer fails; `userId` empty string fails; `releaseTitle` empty string fails; describe `amountInputSchema`: 50 passes; 49 fails with descriptive message; include MPL 2.0 license header
- [x] T032 Create `src/lib/repositories/purchase-repository.spec.ts` — mock Prisma client (`vi.mock`); test `create` writes correct fields; `findByPaymentIntentId` returns record on match, null on miss; `findByUserAndRelease` returns record on match, null on miss; `getDownloadRecord` returns record or null; `upsertDownloadCount` calls `upsert` with `increment: {downloadCount: 1}` and sets `lastDownloadedAt`; `markEmailSent` with `updateMany` — when `count: 1` returned, resolves; when `count: 0` returned (already sent), resolves without duplicate dispatch; include MPL 2.0 license header (depends on T006)
- [x] T033 Create `src/lib/services/purchase-service.spec.ts` — mock `PurchaseRepository`; test `checkExistingPurchase`: returns `true` when record found, `false` when null; test `getDownloadAccess`: no purchase → `{allowed:false, reason:'no_purchase', downloadCount:0}`; `downloadCount >= 5` → `{allowed:false, reason:'download_limit_reached', downloadCount:5}`; `downloadCount < 5` with purchase → `{allowed:true, reason:null, downloadCount:3}`; test `incrementDownloadCount` delegates to `upsertDownloadCount`; include MPL 2.0 license header (depends on T007)
- [x] T034 [P] Create `src/lib/actions/create-purchase-checkout-session-action.spec.ts` — mock Stripe + PurchaseService + release repository; test: valid input → `{success:true, clientSecret, paymentIntentId}`; `amountCents: 49` → `{success:false, error:'amount_below_minimum'}`; existing purchase → `{success:false, error:'already_purchased'}`; release not found → `{success:false, error:'release_unavailable'}`; Stripe API throws → `{success:false, error:'stripe_error'}`; verify `stripe.checkout.sessions.create` called with `mode:'payment'`, `ui_mode:'custom'`, correct `metadata`; include MPL 2.0 license header (depends on T010)
- [x] T035 [P] Create `src/lib/email/send-purchase-confirmation.spec.ts` — mock SES client + PurchaseRepository; test: first call → `markEmailSent` returns `count:1` → SES `SendEmailCommand` dispatched with correct subject, HTML body, text body, to/from addresses; second call → `markEmailSent` returns `count:0` → SES NOT called (idempotency); SES send throws → error is caught and logged, no re-throw, function resolves; `downloadUrl` constructed correctly from `NEXT_PUBLIC_BASE_URL`; include MPL 2.0 license header (depends on T013)
- [x] T036 [P] Create `src/app/api/releases/[releaseId]/purchase-status/route.spec.ts` — mock `PurchaseRepository`; test: missing `paymentIntentId` query param → 400 `{error:'missing_payment_intent_id'}`; `paymentIntentId` not in DB → 200 `{confirmed:false}`; found in DB → 200 `{confirmed:true}`; response includes `Cache-Control: no-store` header; include MPL 2.0 license header (depends on T014)
- [x] T037 [P] Create `src/app/api/releases/[releaseId]/download/route.spec.ts` — mock `getToken` + `PurchaseService` + release repository; test: no token → 401 `{error:'unauthenticated'}`; release not found → 404 `{error:'release_not_found'}`; `downloadUrls` empty → 404 `{error:'no_download_url'}`; `no_purchase` → 403 `{error:'no_purchase'}`; `download_limit_reached` → 403 `{error:'download_limit_reached', downloadCount:5, maxDownloadCount:5}`; success → `incrementDownloadCount` called then 302 redirect to `release.downloadUrls[0]`; include MPL 2.0 license header (depends on T015)
- [x] T038 Create `src/app/api/stripe/webhook/route.spec.ts` additions — add `describe` block for payment-mode branch: IP allowlist — non-Stripe IP → 403; matching Stripe IP → passes; `SKIP_STRIPE_IP_CHECK=true` → bypasses check; `release_purchase` metadata + valid session → `PurchaseRepository.create` called + `sendPurchaseConfirmationEmail` called; duplicate `paymentIntentId` (existing record found) → no `create`, no email, returns 200; `session.mode !== 'payment'` → existing subscription branch executes (no regression); include MPL 2.0 license header updates (depends on T016)
- [x] T039 [P] Create `src/app/components/purchase-checkout-step.spec.tsx` — mock `useCheckout` from `@stripe/react-stripe-js`; mock Tanstack Query `useQuery`; test: `checkout.confirm()` returns `{type:'complete'}` → spinner displayed; `useQuery` returns `{confirmed:false}` → spinner persists; `useQuery` returns `{confirmed:true}` → `onConfirmed` called; after 90 s (mock timer) without `confirmed:true` → timeout message rendered; `checkout.confirm()` returns error type → `onError` called with message; include MPL 2.0 license header (depends on T008)
- [x] T040 [P] Create `src/app/components/purchase-success-step.spec.tsx` — test: success heading rendered; download link href = `/api/releases/${releaseId}/download`; "A confirmation email is on its way" text present; `releaseTitle` prop displayed in success copy; include MPL 2.0 license header (depends on T009)

**Checkpoint**: 90–95%+ coverage on all new files verified via `npm run test:coverage`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T003 and T004 are [P] with each other
- **Foundational (Phase 2)**: Depends on Phase 1 completion (T001, T002) — BLOCKS all user stories; T005 is independent; T006 depends on schema (T002); T007 depends on T006 and T003
- **US1 (Phase 3)**: All depend on Phase 2 completion; T008–T012 are [P] with each other; T013 depends on T011, T012; T014 depends on T006; T015 depends on T003, T006, T007; T016 depends on T006, T013; T017 depends on T008, T009, T010; T018 depends on T006, T017
- **US2 (Phase 4)**: Depends on T017 (Phase 3)
- **US3 (Phase 5)**: Depends on T007, T015, T018, T019
- **US4 (Phase 6)**: Depends on T011, T012, T013 (review/finalize tasks)
- **Polish (Phase 7)**: Depends on all user story phases complete
- **Tests (Phase 8)**: T031 independent; T032 depends on T006; T033 depends on T007; T034 depends on T010; T035 depends on T013; T036 depends on T014; T037 depends on T015; T038 depends on T016; T039 depends on T008; T040 depends on T009; T031–T033 can begin after Phase 2; T034–T040 can begin after their respective Phase 3 tasks complete; **can be written in parallel with implementation** (TDD approach)

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — no other user story dependency
- **US2 (P2)**: Depends on US1's dialog changes (T017) — adds guest routing on top
- **US3 (P3)**: Depends on US1's download gate (T015) and page data fetching (T018), and US2's dialog changes (T019)
- **US4 (P4)**: Depends on US1's email implementation (T011–T013) — finalises/validates content

### Within Phase 3 (US1) — Parallel Opportunities

```bash
# These T008–T012 tasks have no inter-dependencies and touch different files:
- T008: src/app/components/purchase-checkout-step.tsx
- T009: src/app/components/purchase-success-step.tsx
- T010: src/lib/actions/create-purchase-checkout-session-action.ts
- T011: src/lib/email/purchase-confirmation-email-html.ts
- T012: src/lib/email/purchase-confirmation-email-text.ts

# Then sequentially:
- T013: send-purchase-confirmation.ts (needs T011, T012)
- T014: purchase-status/route.ts (needs T006)
- T015: download/route.ts (needs T003, T006, T007)
- T016: webhook/route.ts (needs T006, T013)
- T017: download-dialog.tsx (needs T008, T009, T010)
- T018: releases/[releaseId]/page.tsx (needs T006, T017)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T007)
3. Complete Phase 3: User Story 1 (T008–T018)
4. **STOP and VALIDATE**: Run quickstart.md walkthrough for authenticated purchase
5. Deploy / demo if ready — authenticated fans can already purchase and download

### Incremental Delivery

1. **Setup + Foundational** → schema and services ready
2. **+ US1** → authenticated purchase works end-to-end (MVP!)
3. **+ US2** → guest purchase works → new supporter acquisition path live
4. **+ US3** → returning purchasers get seamless re-download experience
5. **+ US4** → email content validated and edge cases hardened
6. **+ Polish** → production-ready

### Parallel Team Strategy

With two developers after Foundational is complete:

- **Dev A**: T008, T009, T010, T017, T018 (dialog + action)
- **Dev B**: T011, T012, T013, T014, T015, T016 (email + API routes + webhook)

Both streams merge at T017/T018 before Phase 4 begins.

---

## Notes

- [P] tasks touch different files — safe to run in parallel within their phase
- [Story] label maps each task to its user story for traceability
- Each user story checkpoint should be validated before starting the next story
- `download-dialog.tsx` is the most-modified file — coordinate carefully across phases 3–5
- Never set `SKIP_STRIPE_IP_CHECK=true` outside `.env.local`
- The download count cap (5) is enforced at BOTH the API route level (T015) and the UI level (T021) — both must be in place for full protection
- Commit after each phase checkpoint at minimum
