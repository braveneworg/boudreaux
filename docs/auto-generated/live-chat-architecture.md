# Live Chat Architecture

_Last updated: 2026-05-13_

This document describes the Fake Four Inc. live-chat drawer feature
(branch `develop/feature/create-live-chat`). It is the authoritative
overview of the moving parts, the choices behind them, and the on-call
runbook for chat issues.

## At a glance

A globally-mounted, authenticated-only chat drawer with optimistic
message sends, presence-channel realtime over Pusher, sliding-window
rate limiting via Upstash Redis, device fingerprinting for abuse
detection, and an admin moderation panel.

```
Browser                                Next.js server                MongoDB           External
─────────────────────────────────────  ────────────────────────────  ──────────────  ──────────────────
ChatLauncher (root layout)
 ├── ChatTriggerButton ───────────────────────────────────────────────────────────────
 └── (on open, authenticated)
     ChatBody
      ├── useInfiniteChatMessagesQuery ─────► GET  /api/chat/messages ─────► ChatMessage ←──── (read)
      ├── useChatChannel ───────────► POST /api/chat/pusher-auth ───────────────────► Pusher (presence)
      ├── useFingerprint            (FingerprintJS, lazy)
      ├── ChatInput ────────────────► sendChatMessageAction        ─► ChatMessage
      │                                   ├─ checkChatRateLimit ────────────────────► Upstash Redis
      │                                   ├─ ChatUser.upsert       ─► ChatUser
      │                                   ├─ flag at ≥8/min        ─► ChatUser
      │                                   ├─ logBreach (on 429)    ─► ChatRateLimitLog
      │                                   └─ triggerChatEvent ─────────────────────► Pusher → all clients
      ├── ChatReactionBar / ChatEmojiPicker ─► toggleChatReactionAction ─► ChatMessage / Pusher
      └── ChatTypingIndicator ◄────── client-typing event ◄──────────────────────── Pusher (presence)

Admin
 └── /admin/chat
      └── ChatUsersTable ───────────► GET   /api/admin/chat/users  ─► ChatUser ← User
                                ───── (Server Action) updateChatUserAction ─► ChatUser
```

## Components by layer

### Persistence (Phase 1)

Three new Prisma models in [`prisma/schema.prisma`](../../prisma/schema.prisma):

| Model              | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `ChatMessage`      | Append-only message log. `reactions` is an embedded `Json` array.                 |
| `ChatUser`         | One row per `User.id` (`@unique`). Tracks fingerprint, IP, lifetime count, flags. |
| `ChatRateLimitLog` | Append-only audit of every 429 — fingerprint + IP + timestamp.                    |

Indexes: `ChatMessage.createdAt(sort: Desc)` for cursor pagination,
`ChatMessage.userId` for admin queries, `ChatUser.flagged`/`disabled` for
admin filters, `ChatRateLimitLog.attemptedAt` for time-windowed counts.

Inverse relations: `User.chatMessages` (1:N) and `User.chatUsers` (1:N
even though `userId` is unique — Prisma+Mongo work better with a list
relation here).

### Data access (Phase 1)

Repository pattern under [`src/lib/repositories/`](../../src/lib/repositories/):

- `ChatMessageRepository` — `create`, `findRecent({ limit, cursor })`,
  `findById`, `findByUserId`, `setReactions`. Cursor is
  `{ createdAt, id }` for stable secondary ordering across millisecond
  collisions.
- `ChatUserRepository` — `upsert`, `findByUserId`, `incrementMessageCount`,
  `setFlagged`, `setDisabled`, `findManyPaginated`, `count`.
- `ChatRateLimitLogRepository` — `logBreach`, `countByFingerprintSince`.

### Services (Phase 2)

[`ChatService`](../../src/lib/services/chat-service.ts) — orchestrates
sends, reactions, and reads:

- `sendMessage` enforces the disabled gate, calls
  `checkChatRateLimit`, logs a breach on 429, upserts the `ChatUser`,
  auto-flags the sender when sends-in-window reach
  `CHAT_FLAG_THRESHOLD = 8`, persists the message, and broadcasts via
  `triggerChatEvent`.
- `toggleReaction` performs a four-way set update on the embedded
  reactions JSON (add new entry / append voter / remove voter / drop
  entry). Last-write-wins; acceptable for emoji toggles.
- `listRecent` reverses repo output into chronological order and
  attaches the Gravatar hash (server-side; peer emails never leave
  the server).

[`ChatAdminService`](../../src/lib/services/chat-admin-service.ts) —
paginated list of `ChatUser` rows joined with `User`, plus
`setDisabled` / `clearFlag` operations.

### Server Actions (Phase 2)

Per `CLAUDE.md`, mutations go through Server Actions:

- `sendChatMessageAction` — `auth()` + Zod validate +
  `extractClientIpFromHeaders(await headers())` + service call.
- `toggleChatReactionAction` — same shape.
- `updateChatUserAction` — `requireRole('admin')` + service call +
  `revalidatePath('/admin/chat')`.

Each returns a discriminated union:

```ts
{ success: true; data: T } | { success: false; error: '…'; … }
```

so callers can map to the right UI feedback.

### API routes (Phase 2)

GET-only **per project convention**. The one exception is the Pusher
handshake, which is a server-signed authorisation response — not a
mutation.

| Route                   | Method | Decorator   | Purpose                        |
| ----------------------- | ------ | ----------- | ------------------------------ |
| `/api/chat/messages`    | GET    | `withAuth`  | Cursor-paginated history fetch |
| `/api/chat/pusher-auth` | POST   | `withAuth`  | Presence-channel auth signing  |
| `/api/admin/chat/users` | GET    | `withAdmin` | Paginated `ChatUser` list      |

### Realtime infrastructure (Phase 3)

- [`getPusherClient`](../../src/lib/utils/pusher-client.ts) — browser
  singleton. Lazy: only constructed when the drawer mounts an
  authenticated body. In `NEXT_PUBLIC_E2E_MODE`, returns a no-op
  stand-in so E2E does not need real Pusher credentials.
- [`getPusherServer`](../../src/lib/utils/pusher-server.ts) — server
  singleton. `triggerChatEvent` is a no-op in `E2E_MODE`.
- [`useChatChannel`](../../src/app/hooks/use-chat-channel.ts) —
  subscribes to `presence-fake-four-chat`, tracks the live member roster,
  exposes ref-stashed callback props (`onNewMessage`,
  `onReactionUpdated`, `onTyping`) so re-renders don't re-bind handlers.
  `sendTyping` is throttled to 1500 ms.
- [`useInfiniteChatMessagesQuery`](../../src/app/hooks/use-infinite-chat-messages-query.ts)
  — TanStack infinite query. Flattens pages oldest → newest. Hard cap
  at `MAX_TOTAL_MESSAGES = 200`.
- [`useFingerprint`](../../src/app/hooks/use-fingerprint.ts) —
  module-scoped FingerprintJS agent so the lib loads at most once per
  tab. Cancellation guard prevents post-unmount state updates.

### UI (Phases 4–6)

All under [`src/app/components/chat/`](../../src/app/components/chat/):

- **chat-launcher** — top-level mount in `app/layout.tsx`. Holds
  open state, renders the trigger always and the drawer body
  conditionally (`ChatBody` for authenticated, `ChatAuthGate` for
  unauthenticated).
- **chat-trigger-button** — frosted-glass speech-bubble fixed at
  `bottom-6 right-6 z-50`.
- **chat-drawer** — wraps shadcn Vaul drawer with
  `direction={isMobile ? 'bottom' : 'right'}`, overrides max-height to
  `85dvh` on mobile and width to `400px` on desktop, sticky header
  with title + close.
- **chat-auth-gate** — `/signin?callbackUrl=<current path>` CTA.
- **chat-body** — orchestrates query + Pusher + fingerprint +
  optimistic layer.
- **chat-message-list** — scroll anchoring: bottom on first paint and
  on new tail messages when the user is already at the bottom;
  preserves viewport on prepend by adjusting `scrollTop` by the
  height delta; auto-scroll suppressed when the user has scrolled up.
- **chat-message-row** — avatar (server-supplied Gravatar hash;
  identicon fallback), username, locale timestamp, body with
  `whitespace-pre-wrap`, pending spinner / failed marker, reactionBar
  slot.
- **chat-input** — auto-growing textarea (`field-sizing: content` +
  JS fallback measuring `scrollHeight` capped at 3 lines), Enter to
  send, Shift+Enter for newline, red-orange gradient send button when
  non-empty, optimistic append, sonner toast for rate-limit / disabled
  / unauthorized errors.
- **chat-reaction-bar** — aggregated emoji pills with vote count,
  `aria-pressed` highlight for the current user's votes.
- **chat-emoji-picker** — `next/dynamic` lazy-loaded emoji-mart
  picker, Popover-anchored. ~200KB dataset deferred until first
  reaction click.
- **chat-typing-indicator** — three staggered bouncing dots + "X is
  typing… / X and Y are typing… / X and N others are typing…".
- **chat-launcher** dropdown of the above into the root layout — the
  trigger is global, the drawer mounts only when opened, the body's
  network + Pusher work only runs while `enabled` (open) is true.

### Optimistic layer (Phase 5)

[`useOptimisticChat`](../../src/app/hooks/use-optimistic-chat.ts)
layers:

1. `baseMessages` — persisted history from the infinite query.
2. `liveMessages` — Pusher broadcasts that aren't already in history.
3. `localMessages` — optimistic placeholders awaiting send confirmation.

Echo dedupe rule: when a server echo arrives, drop any local
placeholder whose `user.id` + `body` match. Failed placeholders
(`failed: true`) are preserved for retry.

### Admin (Phase 7)

[`/admin/chat`](../../src/app/admin/chat/page.tsx) — Server Component
auto-gated by `requireRole('admin')` in `/admin/layout.tsx`.
[`ChatUsersTable`](../../src/app/admin/chat/chat-users-table.tsx) is a
Client Component built on the existing `<Table>` primitive (no new
DataTable primitive per `CLAUDE.md`). Columns: Username, Email,
Messages, Flagged, Disabled, Last seen, Actions.

## Key decisions

### Server Actions vs API routes for mutations

`CLAUDE.md` mandates Server Actions for mutations, GET-only API routes
for queries. The Pusher SDK works equally well from a Server Action —
it's an HTTP call. The only API-route POST is `/api/chat/pusher-auth`,
which is an auth handshake, not a mutation. Tradeoff: Server Actions
return structured errors (`{ error: 'rate_limited', retryAfterSeconds }`)
instead of HTTP 429 + `Retry-After`. UX is identical.

### Lazy Pusher subscription + sign-out teardown

The browser Pusher client is constructed only when an authenticated
user opens the drawer (not at the app root). This keeps the free-tier
concurrent-connection quota (100) from being consumed by anonymous
visitors. Reopening the drawer in the same tab reuses the cached
socket.

On sign-out (transition from `authenticated` → `unauthenticated` in
`useSession`), `ChatLauncher` calls `disconnectPusherClient()` so the
now-stale `userId` no longer holds a presence membership in the
channel. Without this, a soft sign-out (no full page reload) leaks a
connection slot and keeps broadcasting peer messages to a session
that should no longer be receiving them.

### Reactions as embedded JSON

`ChatMessage.reactions` is a `Json` column of
`{ emoji, userIds[] }[]`. Pros: read locality (every message render
needs reactions); single Mongo update to toggle. Cons: can't
efficiently query "all messages user X reacted to" — not a product
requirement.

**Concurrency**: Prisma's `update` is atomic at the document level,
but the read (`findById`) and the subsequent write (`setReactions`)
are separate round-trips, so two concurrent toggles on the same
message can interleave — the later writer's view of the array
clobbers the earlier writer's change. The outcome is at most one
lost toggle per race; the array shape stays valid. Acceptable
because every toggle is idempotent at the user level. If reaction
integrity ever becomes strict (paid voting, etc.), move to a
`ChatReaction` model with a unique `(messageId, userId, emoji)`
index and `upsert` / `deleteMany` — both single-document atomic.

### Cursor pagination

`createdAt` desc with `id` desc as a stable tiebreaker. Required
because two messages can share a millisecond timestamp under bot
spam; an `id`-only cursor would mis-order them.

### Server-side Gravatar hash

Computed in `ChatService` from the persisted message author's email,
attached to every DTO. Peer emails never appear in API responses or
Pusher broadcasts — only the public-by-design MD5 hash. The
authenticated user's own avatar uses a client-side `crypto-js/md5`
hash of `session.user.email` for optimistic sends.

### Rate-limit key composition

The rate-limit key is `chat:${userId}:${fingerprint}:${ip}`.
`userId` is server-trusted (taken from `auth()` in the Server
Action), so the bucket is enforced per-account first. Fingerprint
and IP narrow the bucket further so a single user with multiple
tabs / devices fans out instead of stacking, and so the
`ChatRateLimitLog` audit row attributes breaches to a specific
device. **Without `userId` in the key, the bucket would be fully
client-controlled** — an attacker could pin a constant fingerprint
to share another user's bucket, or rotate fingerprints to evade
their own limit.

### Optimistic-send tempId echo

`sendChatMessageAction` accepts an optional `tempId` from the
client. The service echoes it back on the returned DTO and on the
Pusher broadcast payload (where it's a non-persisted hint, not a
column). `useOptimisticChat.reconcileEcho` matches placeholder to
echo on `tempId` exactly when both are present, falling back to
`user.id + body` only for echoes that lack a hint (e.g., a peer's
broadcast). This avoids the failure mode where two rapid sends of
the same body collapsed via fuzzy match — the precise key cleanly
pairs each placeholder with its own echo.

### Trigger renders for everyone

Per spec — the floating button shows even to anonymous visitors. Click
opens the drawer with the sign-in CTA. Cost is zero (no API call, no
Pusher connection until auth) and it surfaces "people are chatting
here" as a social signal.

### E2E_MODE no-ops

When `E2E_MODE=true` (server) or `NEXT_PUBLIC_E2E_MODE=true` (client),
Pusher trigger + subscribe are stubbed, and Upstash rate-limit checks
short-circuit to allow. The unit tests cover the real paths; E2E
covers single-page integration.

## Environment variables

Server-side (required at runtime, validated in
[`env-validation.ts`](../../src/lib/config/env-validation.ts)):

- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

Client-side (must be `NEXT_PUBLIC_*` to reach the browser):

- `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`

## Capacity / cost ceiling

Free-tier limits and the traffic they imply:

| Service       | Free-tier ceiling                           | Effective chat capacity                                  |
| ------------- | ------------------------------------------- | -------------------------------------------------------- |
| Pusher        | 100 max concurrent, 200k messages/day       | ~30 concurrent users sustained, ~6.6k sends/day total    |
| Upstash Redis | 10k commands/day                            | ~5k chat sends/day (2 commands per send for the limiter) |
| MongoDB Atlas | (existing tier — chat collections are tiny) | n/a                                                      |

Both Pusher and Upstash have one-click upgrade paths if usage grows.

## Operational runbook

**"Users report chat not delivering"**

1. Confirm `PUSHER_*` env vars are set in the running environment
   (don't read them — check the dashboard or deployment manifest).
2. Check Pusher's status page and the dashboard for connection
   counts. If concurrent connections is near 100 on Sandbox, upgrade
   to Startup.
3. The send still persists even if Pusher is down (the trigger
   wraps errors); affected users would just need a page refresh to
   see new messages.

**"Users report `Slow down — try again in N seconds` even at low volume"**

1. Check Upstash daily command count.
2. If it's near 10k, the sliding-window window may be saturating
   from log spam — inspect `ChatRateLimitLog` for hot fingerprints.

**"A user is being abusive"**

1. Sign in as admin → `/admin/chat`.
2. Find their row (sorted by message count desc by default).
3. Flip the **Disabled** switch — their next send returns the
   disabled error inside the drawer.
4. If they appear to be evading via multiple accounts, the
   `fingerprint` + `ipAddress` columns identify the device. Same
   fingerprint + IP across multiple `userId`s is the signal.

**"How do I clear a user's flag after manual review?"**

1. `/admin/chat` → find the row → click **Clear flag**.

## Test coverage

- Unit / component / hook: `src/**/*.spec.{ts,tsx}` — ~150 tests
  across the chat surface, all green in the main suite.
- E2E: [`e2e/tests/chat-drawer.spec.ts`](../../e2e/tests/chat-drawer.spec.ts)
  and [`e2e/tests/admin-chat.spec.ts`](../../e2e/tests/admin-chat.spec.ts)
  cover the single-browser drawer flow and the admin moderation cycle
  (disable → user gets blocked → re-enable).

## Future work (out of scope for the initial ship)

- Per-user message-detail view at `/admin/chat/users/[id]`.
- Cross-browser realtime smoke test in E2E (would require a sandbox
  Pusher app dedicated to CI).
- Mention / @-user notifications.
- Slash commands for admins (`/mute`, `/clear`).
- Multi-channel support (today there is one global presence channel).
