<!-- This Source Code Form is subject to the terms of the Mozilla Public
 License, v. 2.0. If a copy of the MPL was not distributed with this
 file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# boudreaux — Architecture Diagrams & Documentation

This document explains the architecture of **boudreaux**, a digital-music
storefront and community platform built on Next.js 16. Each section describes one
diagram, explains how that piece fits the whole, and — most importantly — the
**reasoning** behind the design, including trade-offs.

The diagrams are rendered to a single landscape PDF:
[architecture-diagrams.pdf](architecture-diagrams.pdf). The Mermaid source for
each diagram lives in [diagrams/](diagrams/) and the page list is below. Project
conventions referenced throughout come from [CLAUDE.md](../../CLAUDE.md).

> **Accessibility note:** diagrams are grayscale, high-contrast, and use no text
> smaller than 10px so they remain legible for low-vision readers and when
> printed in black and white.

---

## Table of contents

1. [Frontend Architecture](#1-frontend-architecture)
2. [Backend Architecture (Layered)](#2-backend-architecture-layered)
3. [Integrations & Infrastructure](#3-integrations--infrastructure)
4. [Data Model — Catalog & Commerce](#4-data-model--catalog--commerce)
5. [Data Model — Events & Community](#5-data-model--events--community)
6. [Sequence — Pay-What-You-Want Checkout & Webhook](#6-sequence--pay-what-you-want-checkout--webhook)
7. [Sequence — Download Authorization](#7-sequence--download-authorization)
8. [Sequence — Magic-Link Authentication](#8-sequence--magic-link-authentication)
9. [Sequence — Live Chat Message](#9-sequence--live-chat-message)
10. [User Workflow — Fan Journey](#10-user-workflow--fan-journey)
11. [User Workflow — Admin Management](#11-user-workflow--admin-management)

Appendix: [Glossary](#glossary) · [How to regenerate the PDF](#regenerating-the-pdf)

---

## How to read these diagrams

The system follows a strict separation that [CLAUDE.md](../../CLAUDE.md) calls out
as the default posture: **Server Components by default, Server Actions for
mutations, API routes for queries, and a repository layer for all database
access**. Three recurring boundaries appear across every diagram:

- **Server vs. client** — Server Components render on the server and never ship
  their data-access code to the browser; Client Components (`'use client'`) handle
  interactivity and talk back through narrow, typed channels.
- **Mutations vs. queries** — writes go through Server Actions
  (`src/lib/actions/`), reads go through API route handlers (`src/app/api/`).
- **Layers** — entry point → validation → service → repository → Prisma →
  MongoDB, so business rules never leak into routes and SQL/Mongo details never
  leak into components.

---

## 1. Frontend Architecture

**Source:** [diagrams/01-frontend-architecture.mmd](diagrams/01-frontend-architecture.mmd)
· PDF page 1

### What it shows

How the browser runtime and the Next.js server cooperate. The root layout
([src/app/layout.tsx](../../src/app/layout.tsx)) renders as a Server Component and
wraps the app in `Providers`
([src/app/components/providers.tsx](../../src/app/components/providers.tsx)), which
install the TanStack Query client, the Auth.js session provider, and the theme
provider. Interactive pieces — media players, the chat drawer, forms — are Client
Components that read server data two ways:

- **Reads:** TanStack Query hooks (`src/hooks/` and feature `_hooks/`) call API routes with `fetch`,
  forwarding an `AbortSignal` so navigations cancel in-flight requests.
- **Writes:** React Hook Form + Zod forms submit to Server Actions.
- **Real-time:** the Pusher client pushes chat events straight into component
  state.

### How it fits

This is the "top half" of every request. Public listing pages (releases, tours)
are server-rendered and **dehydrated** into the Query cache via a
`HydrationBoundary`, so the first paint is server-fast and subsequent
interactions are client-smooth without a second fetch.

### Why it is designed this way

- **Server Components by default** keep data-access code and secrets on the
  server and shrink the JavaScript bundle. Only genuinely interactive subtrees opt
  into `'use client'`. See the official guidance on
  [Server vs. Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns).
- **TanStack Query for server state** removes hand-rolled caching, dedupes
  requests, and gives background refetch and cancellation for free. The trade-off
  is an extra dependency and a cache to reason about — mitigated by a central key
  factory (next section).
- **React built-ins for UI state, no Redux/Zustand.** Per
  [CLAUDE.md](../../CLAUDE.md), an external store is only introduced when
  complexity demands it. The benefit is less boilerplate; the drawback is that
  truly global client state must be threaded through context, which the app keeps
  rare.

A representative read hook — note the stable key and forwarded signal:

```ts
// src/app/admin/data-views/_hooks/use-infinite-releases-query.ts (shape)
export const useInfiniteReleasesQuery = (params: ReleasesQueryParams) =>
  useInfiniteQuery({
    queryKey: queryKeys.releases.adminInfinite(params),
    queryFn: ({ pageParam, signal }) => fetchReleasesPage(params, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    placeholderData: keepPreviousData, // keep UI during filter changes
  });
```

Query keys are centralized so cache invalidation stays consistent
([src/lib/query-keys.ts](../../src/lib/query-keys.ts)).

**External references:** [Next.js App Router](https://nextjs.org/docs/app) ·
[TanStack Query](https://tanstack.com/query/latest) ·
[React Server Components](https://react.dev/reference/rsc/server-components)

---

## 2. Backend Architecture (Layered)

**Source:** [diagrams/02-backend-architecture.mmd](diagrams/02-backend-architecture.mmd)
· PDF page 2

### What it shows

The vertical slice every write or read passes through: a **Server Action** or
**API route** enters, cross-cutting **decorators** apply (`withAuth` / `withAdmin`
for identity and role, `withRateLimit` for throttling, request-context logging),
input is validated with **Zod**, a **service** runs business logic, a
**repository** performs data access, and **Prisma** talks to **MongoDB**. Services
also reach out to external systems (Stripe, S3, SES, Pusher).

### How it fits

This is the "bottom half" that the frontend talks to. Keeping these layers
distinct is what lets the same business logic back both a Server Action (called
from a form) and an API route (called from a hook) without duplication.

### Why it is designed this way

- **Repository pattern** isolates all Prisma calls. Components and routes never
  touch the database directly, so MongoDB-specific quirks (see the
  [Glossary](#glossary)) live in one place and are unit-testable by mocking at the
  repository boundary.
- **Decorators over inline checks** make auth and rate-limiting declarative and
  impossible to forget. The trade-off is one layer of indirection; the benefit is
  a single audited implementation of "require a logged-in admin."
- **Zod at the edge** means every external input is parsed into a known type
  before any logic runs, eliminating a whole class of "undefined is not a
  function" bugs and giving precise error messages.

The admin gate, applied as a wrapper around a route handler:

```ts
// src/lib/decorators/with-auth.ts (shape)
export function withAdmin<TParams = unknown>(handler: AuthenticatedHandler<TParams>) {
  return async (request, context) =>
    runWithRequestContext(resolveRequestId(request.headers), async () => {
      const session = await auth();
      if (!session?.user?.id)
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      if (session.user.role !== 'admin')
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      return handler(request, context, session);
    });
}
```

**Key files:** [src/lib/decorators/with-auth.ts](../../src/lib/decorators/with-auth.ts) ·
[src/lib/services/](../../src/lib/services/) ·
[src/lib/repositories/](../../src/lib/repositories/) ·
[src/lib/validation/](../../src/lib/validation/)

**External references:** [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) ·
[Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) ·
[Zod](https://zod.dev) · [Prisma + MongoDB](https://www.prisma.io/docs/orm/overview/databases/mongodb)

---

## 3. Integrations & Infrastructure

**Source:** [diagrams/03-integrations-infrastructure.mmd](diagrams/03-integrations-infrastructure.mmd)
· PDF page 3

### What it shows

The deployed system: an NGINX reverse proxy and a CloudFront CDN sit in front of
the Next.js container; MongoDB and S3 hold data and media; Stripe, SES, and Pusher
provide payments, email, and real-time messaging; and application logs flow as
JSON to Grafana Alloy → Loki → Grafana.

### How it fits

It is the operational context for diagrams 1–2: where the code runs and which
third parties it depends on. The application is **stateless** behind the proxy, so
it can be redeployed or scaled without losing data — all state is in MongoDB, S3,
or the third-party services.

### Why it is designed this way

- **Presigned URLs + CDN for media.** Large audio files never stream through the
  app server. The app signs a short-lived URL (15 min for uploads, 24 h for
  downloads) and the client transfers directly to/from S3/CloudFront. This keeps
  the app's memory and bandwidth low; the trade-off is signing complexity and
  clock-sensitive expiry windows.
- **Managed third parties** (Stripe, SES, Pusher) over self-hosting payment,
  email, and websocket infrastructure trades vendor cost and lock-in for
  reliability, compliance (PCI), and far less operational burden.
- **Structured logs to Loki** give searchable, centralized observability with
  automatic PII redaction in the logger
  ([src/lib/utils/logger.ts](../../src/lib/utils/logger.ts)). The drawback is
  running the Alloy/Loki/Grafana stack; the benefit is being able to trace a
  request by ID across the whole system.

**External references:** [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) ·
[CloudFront signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html) ·
[Grafana Loki](https://grafana.com/docs/loki/latest/)

---

## 4. Data Model — Catalog & Commerce

**Source:** [diagrams/04-data-model-catalog-commerce.mmd](diagrams/04-data-model-catalog-commerce.mmd)
· PDF page 4

### What it shows

The entities behind the store: `User`, `Release`, the `Artist` ↔ `Release`
many-to-many (`ArtistRelease`), the audio delivery chain
(`ReleaseDigitalFormat` → `ReleaseDigitalFormatFile`), and the commerce records
(`ReleasePurchase`, `ReleaseDownload`, `UserDownloadQuota`).

### How it fits

This is the source of truth the catalog pages, checkout, and download gate all
read and write. The full schema is in
[prisma/schema.prisma](../../prisma/schema.prisma).

### Why it is designed this way

- **Formats and files are separate tables.** A release has many formats (MP3 320,
  FLAC, …) and each format has many track files. Splitting them lets a track's
  metadata (duration, S3 key, size) live per file while cached aggregates
  (`trackCount`, `totalFileSize`) live on the format for cheap listing.
- **`stripePaymentIntentId` is unique on `ReleasePurchase`.** That uniqueness is
  the idempotency key that makes the payment webhook safe to retry (diagram 6).
- **Freemium quota is modeled explicitly** (`UserDownloadQuota` with a capped
  `uniqueReleaseIds`) rather than computed on the fly, so the "max 5 free releases"
  rule is a single authoritative record per user or guest.

The webhook relies on the unique constraint for idempotency:

```ts
// src/lib/repositories/purchase-repository.ts (shape)
static async findByPaymentIntentId(paymentIntentId: string) {
  return prisma.releasePurchase.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
}
```

**External references:** [Prisma data model](https://www.prisma.io/docs/orm/prisma-schema/data-model/models) ·
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)

---

## 5. Data Model — Events & Community

**Source:** [diagrams/05-data-model-events-community.mmd](diagrams/05-data-model-events-community.mmd)
· PDF page 5

### What it shows

The tour-management and community-moderation entities: `Tour` → `TourDate` →
`Venue`, the `Artist` ↔ `TourDate` headliner link, and the chat/moderation tables
(`ChatMessage`, `ChatUser`, `AbuseReport`, `BannedIdentity`).

### How it fits

These power the tours pages and the live chat. They are split from diagram 4
purely for legibility — together they are one MongoDB database — but they form a
natural second domain around events and people rather than catalog and money.

### Why it is designed this way

- **Venue is its own entity**, not embedded in a tour date, so the same venue
  (with its address and timezone) is reused across many dates without duplication.
- **Moderation state lives beside chat.** `ChatMessage` carries `hiddenAt` and
  `pinnedAt` for soft moderation, while `ChatUser`, `AbuseReport`, and
  `BannedIdentity` support reporting, disabling, and ban-evasion checks. Storing a
  `fingerprintHash` lets bans survive a cleared cookie without storing raw PII.
- **Soft signals over hard deletes.** Hiding a message (timestamp) instead of
  deleting it preserves an audit trail — important for moderation disputes.

**External references:** [MongoDB data modeling](https://www.mongodb.com/docs/manual/data-modeling/) ·
[Prisma relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)

---

## 6. Sequence — Pay-What-You-Want Checkout & Webhook

**Source:** [diagrams/06-sequence-purchase-checkout.mmd](diagrams/06-sequence-purchase-checkout.mmd)
· PDF page 6

### What it shows

The full purchase flow: the buyer picks a price, the
`createPurchaseCheckoutSessionAction` validates and creates a Stripe Checkout
Session, the client confirms payment with the Payment Element, and Stripe later
calls the webhook, which idempotently records the purchase and emails a receipt.

### How it fits

This is the commerce-critical path, spanning the frontend (Payment Element), a
Server Action, Stripe, the webhook route, the purchase repository, and SES.

### Why it is designed this way

- **The server resolves identity and price authority.** The action never trusts a
  client-supplied user id; it reads the session server-side and rate-limits before
  creating a session. This prevents a client from attributing a purchase to
  someone else.
- **The webhook is the source of truth, not the browser.** A buyer's tab can close
  before the redirect; relying on the asynchronous `payment_intent.succeeded`
  webhook guarantees the purchase is recorded even then. See
  [Stripe webhooks](https://docs.stripe.com/webhooks).
- **Idempotency + atomic email guard.** The unique `stripePaymentIntentId` makes
  duplicate webhook deliveries no-ops, and `markEmailSent` uses a conditional
  update so two concurrent deliveries can't both send a receipt:

```ts
// src/lib/repositories/purchase-repository.ts (shape)
static async markEmailSent(purchaseId: string): Promise<boolean> {
  const result = await prisma.releasePurchase.updateMany({
    where: { id: purchaseId, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  });
  return result.count > 0; // true only for the winner
}
```

**Key files:** [create-purchase-checkout-session-action.ts](../../src/lib/actions/create-purchase-checkout-session-action.ts) ·
[stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) ·
[src/lib/stripe.ts](../../src/lib/stripe.ts)

**External references:** [Stripe Checkout](https://docs.stripe.com/payments/checkout) ·
[Payment Element](https://docs.stripe.com/payments/payment-element)

---

## 7. Sequence — Download Authorization

**Source:** [diagrams/07-sequence-download-authorization.mmd](diagrams/07-sequence-download-authorization.mmd)
· PDF page 7

### What it shows

What happens when a user clicks **Download**: a Server Action asks
`PurchaseService` whether the subject (logged-in user or anonymous guest) may
download. Purchasers are allowed; free-tier users pass through
`QuotaEnforcementService` (max 5 unique releases). If allowed, the server mints a
presigned S3/CloudFront URL, increments the counter, logs a `DownloadEvent`, and
returns the URL; otherwise it returns a friendly limit message.

### How it fits

It connects the commerce data model (diagram 4) to the storage infrastructure
(diagram 3) and is the gate that protects paid content while still allowing a
generous free tier.

### Why it is designed this way

- **Authorize on the server, transfer peer-to-peer.** The app decides access but
  never proxies the file — the presigned URL lets the client pull directly from
  CloudFront/S3, keeping the app lightweight.
- **One code path for users and guests.** A `DownloadSubject` discriminated union
  lets the same service enforce both per-user quotas and anonymous guest caps
  (cookie + fingerprint), so the rules can't drift apart.
- **Every attempt is logged.** `DownloadEvent` records successes and failures with
  an `errorCode`, which feeds abuse detection and analytics. The cost is extra
  writes; the benefit is a complete audit trail and the ability to tune the quota
  with real data.

**Key files:** [src/lib/services/purchase-service.ts](../../src/lib/services/purchase-service.ts) ·
[src/lib/utils/s3-client.ts](../../src/lib/utils/s3-client.ts)

---

## 8. Sequence — Magic-Link Authentication

**Source:** [diagrams/08-sequence-magic-link-auth.mmd](diagrams/08-sequence-magic-link-auth.mmd)
· PDF page 8

### What it shows

Passwordless sign-in via Auth.js (NextAuth): the user submits an email, Auth.js
stores a verification token and sends a magic link through SES, the user clicks it,
the token is verified, and a `signIn` callback checks `BannedIdentity` before a
session is issued.

### How it fits

Authentication underpins the admin gate (diagram 2), the download gate
(diagram 7), and chat (diagram 9). The configuration lives in
[auth.ts](../../auth.ts).

### Why it is designed this way

- **No passwords to store or leak.** Magic links remove credential-stuffing and
  password-reset attack surface entirely. The trade-off is dependence on timely
  email delivery, which SES provides.
- **Ban enforcement at the authentication boundary.** Returning `false` from the
  `signIn` callback when an email or fingerprint is banned stops evaders before a
  session exists — the cheapest possible place to reject them.
- **JWT sessions** keep the app stateless behind the proxy (diagram 3), so no
  server-side session store is required on the hot path.

**External references:** [Auth.js](https://authjs.dev) ·
[NextAuth Email/Nodemailer provider](https://authjs.dev/getting-started/authentication/email)

---

## 9. Sequence — Live Chat Message

**Source:** [diagrams/09-sequence-chat-message.mmd](diagrams/09-sequence-chat-message.mmd)
· PDF page 9

### What it shows

Sending a chat message: the UI appends an **optimistic** message immediately, the
`sendChatMessageAction` validates, rate-limits, and ban-checks, `ChatService`
persists it and triggers a Pusher broadcast, and all connected clients (including
the author, reconciling by `tempId`) receive it. On failure the optimistic message
is marked failed.

### How it fits

It combines the frontend's optimistic-update pattern with the backend layers and
the Pusher integration from diagram 3 — the only flow where the server pushes to
the browser rather than the browser pulling.

### Why it is designed this way

- **Optimistic UI for perceived speed.** Showing the message instantly makes chat
  feel real-time even before the round-trip completes; the `tempId` lets the later
  broadcast replace the placeholder cleanly. The risk — a message that later fails
  — is handled explicitly with a failed state.
- **Pusher instead of self-hosted WebSockets.** A managed pub/sub service removes
  the burden of running and scaling socket servers behind the proxy, at the cost of
  per-message vendor pricing.
- **The same guard rails as every write** — Zod validation, rate limiting, and ban
  checks — apply here too, so the real-time path is no less safe than a form post.

**Key files:** [send-chat-message-action.ts](../../src/lib/actions/send-chat-message-action.ts) ·
[src/app/components/chat/](../../src/app/components/chat/)

**External references:** [Pusher Channels](https://pusher.com/docs/channels/) ·
[Optimistic updates (TanStack)](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)

---

## 10. User Workflow — Fan Journey

**Source:** [diagrams/10-workflow-fan-journey.mmd](diagrams/10-workflow-fan-journey.mmd)
· PDF page 10

### What it shows

The end-to-end experience of a fan: browse/search → open a release → stream a
preview → decide to keep it → either take a **free** download (if within the
quota) or **pay what they want** → receive the file → (if signed in) save it to a
collection and join the community chat.

### How it fits

It ties the technical sequences (6, 7, 9) together from the user's point of view,
showing where each system flow is triggered during a single visit.

### Why it is designed this way

- **Freemium funnel.** A generous free tier (5 releases) lowers the barrier to the
  first download, and the quota gate nudges engaged fans toward the
  pay-what-you-want path — aligning the product with an artist-supportive, low-
  friction ethos.
- **Listen before you commit.** Streaming previews via the CDN reduces purchase
  regret and bandwidth cost simultaneously.
- **Community as retention.** Routing satisfied buyers into chat turns a
  transaction into an ongoing relationship; the authentication gate keeps that
  space accountable.

---

## 11. User Workflow — Admin Management

**Source:** [diagrams/11-workflow-admin-management.mmd](diagrams/11-workflow-admin-management.mmd)
· PDF page 11

### What it shows

The admin's path: sign in → pass the `withAdmin` role gate → reach the dashboard →
manage releases, tours/venues, featured artists/banners, or moderate chat. The
release path expands into the upload pipeline: request a presigned URL → upload
directly to S3 → extract audio metadata and create format/file records → publish.

### How it fits

It is the write-side mirror of the fan journey and exercises the same backend
layers (diagram 2), storage (diagram 3), and data model (diagrams 4–5) that fans
read from.

### Why it is designed this way

- **Role-gated at the edge.** Every admin route and action is wrapped in
  `withAdmin`, so privilege checks are uniform and auditable rather than scattered.
- **Direct-to-S3 uploads.** Large audio files bypass the app server via presigned
  PUT URLs, the same principle as downloads (diagram 7), keeping the server thin.
- **Publish is an explicit state, not a delete/recreate.** Setting `publishedAt`
  flips visibility atomically and reversibly, so a release can be staged, reviewed,
  and unpublished without data loss.

**Key files:** [presigned-upload-actions.ts](../../src/lib/actions/presigned-upload-actions.ts) ·
[src/lib/services/](../../src/lib/services/) · [src/app/admin/](../../src/app/admin/)

---

## Glossary

- **Server Component / Client Component** — Next.js render modes; the latter is
  marked `'use client'` and runs in the browser.
- **Server Action** — a server function callable from the client for mutations,
  marked `'use server'`.
- **Repository** — a class that encapsulates all Prisma access for one entity.
- **Presigned URL** — a time-limited, signed URL that authorizes a single S3/
  CloudFront upload or download without exposing credentials.
- **Idempotency key** — a unique value (here `stripePaymentIntentId`) that makes a
  repeated operation safe to run twice.
- **PWYW** — pay-what-you-want pricing.
- **Optimistic update** — showing a result in the UI before the server confirms it,
  then reconciling.
- **MongoDB null-filter quirk** — `{ field: null }` does not match documents where
  the field is absent; queries use `OR` with `isSet: false`. See
  [CLAUDE.md](../../CLAUDE.md) and the repository layer.

---

## Regenerating the PDF

The PDF is produced from the Mermaid sources with no extra npm dependencies —
Mermaid loads from a CDN and headless Chrome prints the result.

```bash
cd docs/architectural-diagrams
node build-pdf.js            # diagrams/*.mmd -> architecture-diagrams.html
# then print to PDF (landscape) with headless Chrome:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=20000 --run-all-compositor-stages-before-draw \
  --print-to-pdf="architecture-diagrams.pdf" \
  "file://$PWD/architecture-diagrams.html"
```

To edit a diagram, change its `.mmd` file in [diagrams/](diagrams/) and rerun the
steps above. The page titles in [build-pdf.js](build-pdf.js) and the table of
contents here are kept in sync by hand.
