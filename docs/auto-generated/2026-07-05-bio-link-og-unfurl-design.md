# Bio-editor link OG-unfurl preview — Design (admin-generate-bios-v3, PR 3)

Last updated: 2026-07-05

This is the detailed design (spec) for **PR 3** of the `admin-generate-bios-v3`
feature (sequence 1a → 1b → 2a → 2b → **3**). It refines the PR-3 section of the
overarching, user-approved design doc
(`docs/auto-generated/2026-07-04-admin-generate-bios-v3-design.md`). PRs 1a, 1b,
2a, and 2b are merged and deployed.

## Goal

In the admin bio editor's "Discovered links" palette, each **external** link
gains an eye icon that opens an **unfurl preview card** — title, description,
site name, hero thumbnail, favicon — fetched from a new admin-gated,
SSRF-hardened endpoint. When a link exposes no usable metadata, the card
degrades gracefully to the bare host. **Nothing is persisted**: no DB rows, no
S3 objects, no schema change.

## Decisions locked during brainstorming

Two forks were resolved with the user before this spec:

1. **Hero image → bounded data-URI thumbnail, not a CDN re-host.** The site CSP
   already allows `img-src … data:`, and inserted bio links are plain `<a>`
   tags (the hero image is never saved into the bio). Permanently re-hosting
   every previewed hero to S3 would orphan one object per link _merely hovered_.
   Instead the endpoint fetches the hero (SSRF-guarded), downscales it with
   `sharp`, and returns it base64-inline. This is a deliberate, user-approved
   deviation from the overarching doc's literal "re-host the OG hero image to
   CDN" wording.
2. **HTML parsing → hand-rolled bounded meta extractor, no new dependency.** No
   HTML-parser dependency exists in the tree (`jsdom` is dev-only;
   `html-react-parser` yields React nodes, not a queryable DOM). Every extracted
   text field is passed through `sanitizeBioText` before return, so parser
   choice affects extraction robustness, not security; a parse miss degrades
   gracefully (an already-required acceptance criterion). This keeps the
   dependency tree lean per AGENTS.md.

## Architecture & data flow

- **Client.** `BioLinkPalette` renders an eye-icon trigger on each _external_
  link row. On open (hover/focus on desktop, tap on mobile), a lazy TanStack
  Query hook `useLinkPreviewQuery(url)` — `enabled` only while the card is open
  — issues `GET /api/link-preview?url=<encoded>`, forwarding the request
  `AbortSignal`.
- **Server.** `GET /api/link-preview` →
  `withRateLimit(linkPreviewLimiter, LINK_PREVIEW_LIMIT)(withAdmin(handler))`.
  The handler validates and SSRF-vets the URL, fetches the page HTML
  (DNS-pinned, `redirect:'manual'`, byte-capped, timed out), hand-extracts the
  `<head>` metadata, best-effort fetches and downscales the hero (and favicon)
  into data-URI thumbnails, sanitizes the text fields, and returns JSON. A
  module-level LRU caches results by normalized URL.
- **No persistence.** No Prisma access, no S3 writes, no `prisma/schema.prisma`
  change. Inserted links remain plain `<a>` tags (unchanged from PR 1a/1b).

## Files

### Create

- `src/lib/utils/ssrf-fetch.ts` — shared SSRF primitives (see "Shared SSRF
  util"): `vetHostname`, `buildPinnedDispatcher`, `VettedAddress`.
- `src/lib/utils/ssrf-fetch.spec.ts`
- `src/lib/utils/extract-open-graph.ts` — hand-rolled `<head>` metadata
  extractor: `extractOpenGraph(html: string, pageUrl: string): OpenGraphTags`.
- `src/lib/utils/extract-open-graph.spec.ts`
- `src/lib/validation/link-preview-schema.ts` — Zod schema + `LinkPreview` type.
- `src/lib/validation/link-preview-schema.spec.ts`
- `src/lib/services/link-preview-service.ts` — orchestrates fetch → extract →
  thumbnail → sanitize → cache; the route stays thin.
- `src/lib/services/link-preview-service.spec.ts`
- `src/app/api/link-preview/route.ts` — the GET endpoint.
- `src/app/api/link-preview/route.spec.ts`
- `src/app/hooks/use-link-preview-query.ts`
- `src/app/hooks/use-link-preview-query.spec.ts`
- `src/app/components/forms/link-preview-card.tsx` — shared card body.
- `src/app/components/forms/link-preview-card.spec.tsx`
- `e2e/tests/admin-bio-link-preview.spec.ts`

### Modify

- `src/app/api/proxy-image/route.ts` — replace its module-private
  `resolveAndVetAddress` (returns `NextResponse`) and `buildPinnedDispatcher`
  with the shared `ssrf-fetch` helpers; map `vetHostname`'s result to the same
  `NextResponse` 403/502 it returns today (behavior preserved — its existing
  spec is the regression guard).
- `src/lib/config/rate-limit-tiers.ts` — add `linkPreviewLimiter` +
  `LINK_PREVIEW_LIMIT`.
- `src/lib/query-keys.ts` — add `linkPreview(url)` key factory.
- `src/app/components/forms/bio-link-palette.tsx` — add the eye-icon trigger +
  HoverCard/Popover per external link, rendering `LinkPreviewCard`.

## Shared SSRF util (`src/lib/utils/ssrf-fetch.ts`)

`'server-only'`. Extracts the two security-critical, easy-to-drift pieces
currently private to `proxy-image/route.ts` so both routes share one copy.
Deliberately does **not** own URL parsing, protocol checks, or host allowlists —
those stay per-route (proxy-image keeps its hard allowlist; link-preview omits
it).

```ts
export type VettedAddress = { address: string; family: number };

type VetResult =
  | ({ ok: true } & VettedAddress)
  | { ok: false; reason: 'disallowed' | 'dns_failure' };

/** DNS-resolve `hostname` and vet the result against the SSRF blocklist
 *  (`isDisallowedAddress`). Never returns a framework Response — callers map
 *  the reason to their own error. */
export const vetHostname = (hostname: string): Promise<VetResult> => {
  /* … */
};

/** undici Agent whose DNS lookup is pinned to the already-vetted
 *  address/family, closing the DNS-rebinding window between vet and connect.
 *  TLS SNI still uses the original hostname. */
export const buildPinnedDispatcher = (address: string, family: number): Agent => {
  /* … */
};
```

`proxy-image` refactor maps `vetHostname`: `ok:false reason:'disallowed'` →
`403 { error: 'Domain not allowed' }` (+ existing `loggers.s3.warn`),
`reason:'dns_failure'` → `502 { error: 'DNS lookup failed' }`.

## The endpoint — `GET /api/link-preview`

`export const GET = withRateLimit(linkPreviewLimiter, LINK_PREVIEW_LIMIT)(withAdmin(handler))`.

### Contract

- **Query param:** `url` — required; absolute `http:`/`https:`; must be
  **external** (internal/own-host rejected via `isInternalBioUrl`); literal-IP
  hostnames rejected.
- **200 body** (`LinkPreview`):

  ```ts
  interface LinkPreview {
    url: string; // the requested URL (normalized)
    resolved: boolean; // false ⇒ graceful fallback, only host is known
    title: string | null;
    description: string | null;
    siteName: string | null; // og:site_name, else the hostname
    imageDataUri: string | null; // data:image/webp;base64,… or null
    faviconDataUri: string | null; // data:image/…;base64,… or null (best-effort)
  }
  ```

- **Status codes:**
  - `400` — missing/invalid/unsupported-protocol/internal URL.
  - `403` — hostname is a literal IP, or resolves to a private/reserved IP.
  - `429` — rate limit exceeded.
  - `200 { resolved:false, siteName:<host>, … null }` — **upstream failures
    degrade gracefully**: DNS-resolution failure (host does not resolve),
    redirect, timeout, non-HTML content-type, non-2xx, empty body, or no
    extractable tags. Only _our-side_ input errors — malformed/internal URL
    (400), private-or-literal-IP host (403), rate limit (429) — are non-200, so
    the card always renders something.

### Request pipeline (SSRF-hardened, proxy-image-grade minus the allowlist)

1. Parse `url`; require `http:`/`https:`; reject `isInternalBioUrl(url)` (400);
   reject `isIP(hostname) !== 0` literal-IP hosts (403).
2. `vetHostname(hostname)` → 403 on `disallowed`; on `dns_failure` return
   `200 { resolved:false }` (a preview should not surface DNS internals — but a
   _positively private_ address is a 403 to satisfy the "rejects private hosts"
   acceptance criterion).
3. `buildPinnedDispatcher(address, family)`.
4. `fetch(url, { redirect:'manual', signal: AbortSignal.timeout(5_000),
headers: { Accept: 'text/html' }, dispatcher })`. Reject 3xx (manual
   redirect), non-2xx, and non-`text/html` content-types → `resolved:false`.
5. Stream the body into a capped buffer (~512 KB — `<head>` sits near the top);
   stop reading at the cap.
6. `extractOpenGraph(html, url)` → tags.
7. Best-effort `imageDataUri`/`faviconDataUri` (see "Thumbnails").
8. Sanitize text fields; assemble `LinkPreview`; cache; return.
9. `dispatcher.close()` in `finally` (body already buffered before any return).

## Head extraction (`extract-open-graph.ts`)

Pure, no I/O. `extractOpenGraph(html: string, pageUrl: string): OpenGraphTags`.

- Slice `html` to the `<head>` region (up to `</head>`, else a byte cap).
- Parse `<meta>` tags **attribute-order-independently** (content may precede or
  follow `property`/`name`; single or double quotes); decode HTML entities.
- Resolution priority:
  - `title` = `og:title` ?? `twitter:title` ?? `<title>` text.
  - `description` = `og:description` ?? `twitter:description` ??
    `meta[name="description"]`.
  - `siteName` = `og:site_name` ?? `null` (route fills the hostname fallback).
  - `image` = `og:image` ?? `twitter:image`.
  - `favicon` = first `link[rel~="icon"]` (incl. `shortcut icon`,
    `apple-touch-icon`).
- Resolve relative `image`/`favicon` URLs against `pageUrl` (`new URL(rel, pageUrl)`).
- Returns raw strings (route/service sanitizes). Missing tags → `null`.

```ts
interface OpenGraphTags {
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}
```

## Thumbnails (data-URI) & sanitization

- **Hero:** if `imageUrl` is present and `vetHostname` passes, fetch it (pinned
  dispatcher, `redirect:'manual'`, `AbortSignal.timeout(5_000)`, cap ~5 MB,
  require `image/*`) → `sharp(buffer).resize({ width: 320,
withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()` → base64 →
  `data:image/webp;base64,…`. Any failure ⇒ `imageDataUri: null` (card renders
  text-only). `sharp` is available server-side (already used by
  `bio-image-service`).
- **Favicon:** same pipeline, `width: 32`, best-effort. First thing to cut if it
  bloats scope; the card is fully functional without it.
- **Text:** `title`, `description`, `siteName` → `sanitizeBioText` before
  return. Data-URIs are safe by construction (we re-encode the bytes via sharp;
  we never echo an attacker-supplied `data:`/`src` string).

## Caching & rate limit

- Module-level `LRUCache<string, LinkPreview>` (`lru-cache`, already a dep),
  `max: 200`, `ttl: 60 * 60 * 1000` (1 h). Caches successes **and**
  `resolved:false` negatives, keyed by normalized URL, to blunt repeat hovers
  and links shared across artists/admins.
- `rate-limit-tiers.ts` gains, in the existing shape:

  ```ts
  /** Link-preview unfurl (admin bio editor) — 30 requests per minute. */
  export const linkPreviewLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 500 });
  export const LINK_PREVIEW_LIMIT = 30;
  ```

- **E2E / fake path:** in `E2E_MODE` the service short-circuits to a
  deterministic, network-free response (mirrors the fake-path convention used by
  the bio-generation and rehost paths) so E2E never reaches the live internet.

## UI

- **`BioLinkPalette`.** For each link where `!isInternalBioUrl(link.url)`, add an
  Eye button (`lucide-react` `Eye`) to the row's action cluster, before Insert.
  Internal links get no eye.
- **Trigger.** Desktop (`!useIsMobile()`): shadcn **HoverCard**
  (`@/components/ui/hover-card`) — opens on hover/focus. Mobile (`useIsMobile()`):
  shadcn **Popover** (`@/components/ui/popover`) — opens on tap. Both render the
  same `LinkPreviewCard`. Query is `enabled` only while the card is open.
- **`LinkPreviewCard`.** Renders: hero thumbnail (plain `<img>` with the
  data-URI + `width`/`height`/`alt` — `next/image` is unnecessary for a bounded,
  self-generated data-URI), favicon + `siteName`, bold `title`, description
  clamped to 2–3 lines, and the bare host as fallback. Loading skeleton while
  the query is pending; empty/error ⇒ "No preview available — `<host>`".
  Semantic HTML, ARIA, keyboard-navigable.
- **Hook `use-link-preview-query.ts`.** `useLinkPreviewQuery(url, options?)` —
  TanStack Query; key `queryKeys.linkPreview(url)`; `queryFn` fetches
  `/api/link-preview?url=<encoded>` forwarding the signal; `staleTime` ~1 h
  (matches server TTL); trailing spread-last `options` override per the repo hook
  convention. jsdoc describes behavior + return value.

## Security recap

- No CSP change; no iframe. The card image is a self-generated data-URI
  (`img-src … data:` already allowed).
- Both external fetches (page HTML + hero/favicon) route through the shared
  `vetHostname` (`isDisallowedAddress`) + `buildPinnedDispatcher` (DNS-pin) +
  `redirect:'manual'`, byte-capped and timed out.
- `withAdmin` + `withRateLimit`. Literal-IP hosts and internal/own-host URLs
  rejected. Extracted text sanitized via `sanitizeBioText`.
- Nothing persisted; no new secret; no schema change.

## Testing (TDD)

- **Unit — extractor:** attribute orders, single/double quotes, priority
  fallbacks (og → twitter → title/description), entity decode, relative
  image/favicon resolution, missing `<head>`, oversized-head byte cap, no tags.
- **Unit — ssrf-fetch:** disallowed IPv4/IPv6 ranges, literal-IP host, DNS
  failure, `disallowed` vs `dns_failure` results, pinned-dispatcher lookup
  (`all` and non-`all` callback forms).
- **Unit — route/service:** `400`/`403`/`429`; `resolved:true` and
  `resolved:false`; upstream failures (redirect, timeout, non-HTML, non-2xx,
  empty) degrade to `200 resolved:false`; sanitization applied; LRU hit skips
  refetch; E2E short-circuit.
- **Unit — thumbnail:** downscale to webp data-URI, oversize reject, non-image
  reject, fetch failure → `null`. Real-`sharp` assertions run under the existing
  `node-forks` Vitest project; fetch/DNS/`sharp` mocked at boundaries elsewhere.
- **Component:** eye rendered only on external links; opening triggers the query;
  card renders title/description/thumbnail; loading + fallback states; mobile
  Popover vs desktop HoverCard via a `useIsMobile` mock.
- **E2E (network-free):** the eye appears on a seeded external link and opens a
  card; the endpoint `403`s a private-host URL and is admin-gated (unauth →
  401/403).
- **Gates:** `pnpm run typecheck && pnpm run test:run && pnpm run lint &&
pnpm run format` all green; branch coverage ≥95%, no regression vs
  `COVERAGE_METRICS.md`.

## Acceptance criteria

1. An OG-tagged external link shows a card with its title, description, site
   name, and hero thumbnail.
2. A link without OG/Twitter/meta tags (or one whose fetch fails) shows a
   graceful fallback card with the bare host — no error surfaced to the admin.
3. The endpoint rejects private/reserved and literal-IP hosts (`403`), rejects
   internal/own-host and malformed URLs (`400`), and is rate-limited (`429`) and
   admin-gated.
4. The hero renders under the existing CSP with no re-hosting and no persisted
   asset.
5. Internal (`/releases/…`) links show no eye icon and are not fetched.

## Out of scope

- No hero persistence (data-URI only); no iframe embeds; no preview for internal
  links; no eager prefetch of all links (lazy per-open only).
- The deferred PR-2b `rehostImages` SSRF host-allowlist follow-up and the PR-1b
  orphaned-exports chore remain separate, tracked items.
