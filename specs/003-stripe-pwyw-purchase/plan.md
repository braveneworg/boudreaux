# Implementation Plan: Stripe Pay-What-You-Want Purchase

**Branch**: `003-stripe-pwyw-purchase` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-stripe-pwyw-purchase/spec.md`

## Summary

Extend the existing `DownloadDialog` multi-step component to support a pay-what-you-want (PWYW)
one-time purchase of a release's downloadable files. The flow reuses the existing embedded Stripe
checkout infrastructure (`ui_mode: 'custom'`, `CheckoutProvider` / `PaymentElement`) with a new
`payment`-mode checkout session action. Guest users follow the same `resolveSubscriberAction`
path already used by subscriptions. A new `payment_intent_id`-keyed handler branch in the
existing webhook route records a `ReleasePurchase` and dispatches a purchase confirmation email
via AWS SES. A new authenticated download API route gates file access by purchase ownership and
enforces a per-user, per-release 5-download cap. Two new Prisma models (`ReleasePurchase`,
`ReleaseDownload`) and a `suggestedPrice` field on `Release` are required.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode)
**Primary Dependencies**: Next.js 16 (App Router), React 18, Stripe 20 (`@stripe/react-stripe-js`
5, embedded custom UI mode), Prisma 5 (MongoDB), Auth.js (JWT sessions, Nodemailer provider),
AWS SES (`@aws-sdk/client-ses`), shadcn/ui (Radix Dialog), React Hook Form, Zod
**Storage**: MongoDB via Prisma
**Testing**: Vitest + `@testing-library/react` + jest-dom (`.spec.ts` adjacent to source)
**Target Platform**: Next.js web application (Vercel / Node.js server)
**Performance Goals**: Authenticated purchase flow under 3 min end-to-end; guest flow under 5 min;
webhook to `ReleasePurchase` write under 30 s; download gate response under 500 ms
**Constraints**: Webhook signature verification + Stripe IP allowlist (FR-020); authenticated-only
download access (FR-019); idempotent webhook handler keyed on `payment_intent.id` (FR-022);
5-download cap enforced atomically (FR-014/FR-015); re-purchase blocked at dialog-open time
(FR-021)
**Scale/Scope**: Small catalog (~50–200 releases), moderate fan traffic; no pagination needed

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                          | Status  | Notes                                                                                                                                                                    |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. TypeScript-First                | ✅ Pass | All new files in strict TypeScript; no `any`; explicit types on all repository/service boundaries                                                                        |
| II. Next.js & React Architecture   | ✅ Pass | Server Components for data fetching; Server Actions for mutations; `'use client'` only on Stripe Elements components; App Router patterns throughout                     |
| III. Test-Driven Development       | ✅ Pass | Unit tests for repository, service, actions, and email templates; component tests for dialog steps; 90–95% coverage target on all testable files                         |
| IV. Security & Data Integrity      | ✅ Pass | Webhook signature verification + IP allowlist (FR-020); Zod on all Server Actions and API routes; auth-gated download endpoint (FR-019); MPL 2.0 header in all new files |
| V. Performance & Scalability       | ✅ Pass | Lazy-initialized Stripe/SES singletons reuse existing pattern; Tanstack Query for purchase-status polling; atomic download-count increment                               |
| VI. Code Quality & Maintainability | ✅ Pass | Repository pattern for all DB access; service layer for business logic; named exports; `cn()` for conditional classes; absolute `@/` imports                             |
| VII. Accessibility & UX            | ✅ Pass | shadcn/ui Dialog primitives reused; ARIA labels on all interactive controls; mobile-first; full keyboard navigation in dialog                                            |

All gates pass. No complexity violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/003-stripe-pwyw-purchase/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code

```text
prisma/
└── schema.prisma                                           [MODIFY] ReleasePurchase, ReleaseDownload,
                                                                     Release.suggestedPrice, User back-relations

src/
├── app/
│   ├── api/
│   │   ├── releases/
│   │   │   └── [releaseId]/
│   │   │       ├── download/
│   │   │       │   └── route.ts                           [NEW] authenticated download gate;
│   │   │       │                                                 purchase check + 5-cap enforcement
│   │   │       └── purchase-status/
│   │   │           └── route.ts                           [NEW] polling endpoint; returns purchase
│   │   │                                                         confirmation state for hybrid UX
│   │   └── stripe/
│   │       └── webhook/
│   │           └── route.ts                               [MODIFY] add payment-mode branch to
│   │                                                               checkout.session.completed handler
│   ├── components/
│   │   ├── download-dialog.tsx                            [MODIFY] add purchase-checkout, pending,
│   │   │                                                           and success dialog steps
│   │   ├── purchase-checkout-step.tsx                     [NEW] PaymentElement PWYW checkout step
│   │   └── purchase-success-step.tsx                      [NEW] post-webhook success with download link
│   └── releases/
│       └── [releaseId]/
│           └── page.tsx                                   [MODIFY] pass releaseId, suggestedPrice,
│                                                                   and purchaseStatus to DownloadDialog
└── lib/
    ├── actions/
    │   └── create-purchase-checkout-session-action.ts     [NEW] payment-mode Stripe Checkout Session
    ├── email/
    │   ├── send-purchase-confirmation.ts                  [NEW] SES dispatch with idempotency guard
    │   ├── purchase-confirmation-email-html.ts            [NEW] HTML email template
    │   └── purchase-confirmation-email-text.ts            [NEW] Plain-text email template
    ├── repositories/
    │   └── purchase-repository.ts                         [NEW] ReleasePurchase + ReleaseDownload
    │                                                             data-access layer
    ├── services/
    │   └── purchase-service.ts                            [NEW] purchase ownership + cap business logic
    └── validation/
        └── purchase-schema.ts                             [NEW] Zod schemas for amount + checkout action
```

**Structure Decision**: Single-project Next.js App Router layout. All new artifacts extend the
established patterns in `stripe/webhook/`, `lib/repositories/`, `lib/services/`, `lib/email/`,
and `app/components/` without introducing new architectural layers. The download API route follows
the existing `app/api/` RESTful convention.
