# Bundle & Free-Status Endpoint Contracts

**Feature**: `007-free-digital-downloads` | **Date**: 2026-05-07

Two endpoints participate in the free flow. The first (bundle) already exists and is extended; the second (free-status) is new.

---

## 1) `GET /api/releases/{releaseId}/download/free-status` (NEW)

Lightweight pre-flight check used by the dialog when it opens to decide whether to render the normal free-formats step or the "Download limit reached" state.

### Request

| Element | Value                                                      |
| ------- | ---------------------------------------------------------- |
| Method  | `GET`                                                      |
| Path    | `/api/releases/{releaseId}/download/free-status`           |
| Auth    | Optional (anonymous allowed)                               |
| Headers | `Cookie: boudreaux_visitor_id=…` (server issues if absent) |
| Query   | none                                                       |

### Response — 200 OK

```jsonc
{
  "allowed": true,
  "remaining": 3,
  "windowSeconds": 86400,
  "resetsAtIso": null,
  "blockedReason": null,
  "availableFreeFormats": ["MP3_320KBPS", "AAC"],
}
```

When the cap is reached:

```jsonc
{
  "allowed": false,
  "remaining": 0,
  "windowSeconds": 86400,
  "resetsAtIso": "2026-05-08T13:42:11.000Z",
  "blockedReason": "cap-reached",
  "availableFreeFormats": ["MP3_320KBPS", "AAC"],
}
```

When neither free format is published for the release:

```jsonc
{
  "allowed": false,
  "remaining": 0,
  "windowSeconds": 86400,
  "resetsAtIso": null,
  "blockedReason": "no-free-formats",
  "availableFreeFormats": [],
}
```

### Response Headers

- `Set-Cookie: boudreaux_visitor_id=…; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` (only if cookie was missing or invalid)
- `Cache-Control: no-store`

### Error responses

- `404 Not Found` — release does not exist.
- `429 Too Many Requests` — per-IP rate limit hit.

### Validation (Zod)

```ts
const FreeStatusResponseSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().min(0).max(3),
  windowSeconds: z.literal(86400),
  resetsAtIso: z.string().datetime().nullable(),
  blockedReason: z.enum(['cap-reached', 'no-free-formats']).nullable(),
  availableFreeFormats: z.array(z.enum(['MP3_320KBPS', 'AAC'])),
});
```

---

## 2) `GET /api/releases/{releaseId}/download/bundle` (MODIFY)

Existing endpoint. The free flow extends the request envelope and the server-side enforcement.

### Request changes

Query parameters (existing):

- `formats` — comma-separated `formatType` values. Free-flow values: `MP3_320KBPS`, `AAC`.
- `respond` — `sse` (default) or `json`.

New behavior:

- If **all** requested `formats` are in `FREE_FORMAT_TYPES` and the request is unauthenticated, the server enters the **free flow**:
  1. Run identity resolution (`resolveVisitorIdentity`) using cookie + fingerprint hash.
  2. Issue/refresh `boudreaux_visitor_id` cookie if needed (BEFORE writing any SSE bytes).
  3. Acquire 30 s lock keyed by `${visitorId}|${releaseId}|${sortedFormatKey}`.
  4. Query `DownloadEvent` for rolling 24h cap. If `count >= 3` → return 403 with `errorCode: 'CAP_REACHED'`.
  5. Run existing flat-prefetch bundle pipeline.
  6. On success, write a `DownloadEvent` row per delivered format with `success=true`.
  7. Release lock.

### New error codes

| HTTP | `errorCode`                 | Meaning                                                                                                                      |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 403  | `CAP_REACHED`               | Visitor has already taken 3 successful free downloads of this release in the trailing 24 hours. Body includes `resetsAtIso`. |
| 409  | `LOCK_HELD`                 | Another preparation for the same `(visitorId, releaseId, sortedFormatKey)` is in progress and the cache is not yet warm.     |
| 400  | `NO_FREE_FORMATS_AVAILABLE` | None of the requested formats are published for this release.                                                                |

### Response — 403 (cap reached)

```jsonc
{
  "errorCode": "CAP_REACHED",
  "message": "Download limit reached. Try again later.",
  "resetsAtIso": "2026-05-08T13:42:11.000Z",
}
```

### Response — 409 (lock held)

```jsonc
{
  "errorCode": "LOCK_HELD",
  "message": "Another download is already preparing. Please wait a moment and try again.",
}
```

### Cookie ordering guarantee

Cookies are set via `cookies().set(...)` BEFORE the `ReadableStream` (SSE) body is constructed. The first byte sent to the browser is `event: ...\ndata: ...\n\n`, well after the response headers (including `Set-Cookie`) have been flushed.

### Idempotency

- The cap is incremented only on `success=true` `DownloadEvent` writes.
- Requests rejected by `CAP_REACHED` or `LOCK_HELD` write a `DownloadEvent` with `success=false` and the corresponding `errorCode` for audit, but those rows are NOT counted by the cap query.

### Auth

- Authenticated users: existing paid-flow rules apply (purchase access check). Free flow is anonymous-only; an authenticated user requesting the same formats receives the existing `PURCHASE_REQUIRED` response unless they have purchased the release.
- Anonymous users: free flow only.
