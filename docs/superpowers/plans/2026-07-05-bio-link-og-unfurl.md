# Bio-editor Link OG-Unfurl Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add an admin-gated, SSRF-hardened link-unfurl preview to the bio editor's discovered-links palette — an eye icon opens a HoverCard (desktop) / Popover (mobile) with the link's title, description, site name, and a bounded data-URI hero thumbnail. Nothing is persisted.

**Architecture:** GET /api/link-preview (withRateLimit + withAdmin) delegates to link-preview-service, which runs a DNS-pinned, redirect:manual, byte-capped, timed-out fetch, hand-extracts head OG/Twitter/meta tags, builds a sharp-downscaled data-URI hero thumbnail, sanitizes text via sanitizeBioText, and LRU-caches by URL. The SSRF primitives (vetHostname, buildPinnedDispatcher) are extracted from the existing proxy-image route into src/lib/utils/ssrf-fetch.ts and shared. Client: useLinkPreviewQuery + LinkPreviewCard wired into BioLinkPalette.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, TanStack Query 5, undici, sharp, lru-cache, sanitize-html, shadcn/ui (Radix HoverCard/Popover), Vitest 4, Playwright.

## Global Constraints

- TypeScript strict: no any, no non-null assertion (!), explicit param + return types, interface for object shapes.
- Arrow functions only; named exports only (App Router route.ts uses 'export const GET'). MPL header (from HEADER.txt) at the top of every NEW source file (not on .spec files? — match sibling files in the same dir).
- Path aliases: @/lib -> src/lib, @/app -> src/app, @/components -> src/app/components, @/ui -> src/app/components/ui, @/hooks -> src/app/hooks, @/utils -> src/lib/utils. Never ../../ traversal.
- Vitest 4: describe/it/expect/vi are GLOBALS (never import from vitest). Server-only specs add vi.mock('server-only', () => ({})). Mock external deps (global fetch, node:dns, undici Agent, sharp) at the boundary. One behavioural condition per test; never expect() inside a conditional.
- TDD per step: write the failing test, run it and see it FAIL, write minimal code, run it and see it PASS, then commit. Real assertions, real code — NO placeholders (no TBD/TODO/'similar to Task N'/'add error handling'/prose-only code step).
- Conventional commits: 'type(scope): <gitmoji> subject', subject <= 50 chars (e.g. 'feat(bio): sparkle link-preview endpoint' with the actual emoji). Gate is BOTH workspaces where relevant, but this feature is web-app only: pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format.
- Coverage: >= 95% branches, no regression. sharp specs that load the native addon run under the existing node-forks Vitest project (see vitest config NATIVE_ADDON_SPECS) — put real-sharp assertions there, mock sharp elsewhere. NATIVE_ADDON_SPECS is an allowlist: every NEW real-sharp spec MUST be registered in it, or it silently runs under the wrong pool (vmThreads) and fails to load the native addon.

### Cross-task interface contracts

Cross-task interface contracts — use these EXACT names, signatures, and import paths verbatim; do not invent alternatives:

src/lib/utils/ssrf-fetch.ts (top: 'server-only')
export type VettedAddress = { address: string; family: number };
type VetResult = ({ ok: true } & VettedAddress) | { ok: false; reason: 'disallowed'; address: string } | { ok: false; reason: 'dns_failure'; error: unknown };
export const vetHostname = (hostname: string): Promise<VetResult> // DNS lookup via node:dns/promises lookup + isDisallowedAddress (import { isDisallowedAddress } from '@/lib/utils/ip-guard'); lookup throw -> { ok:false, reason:'dns_failure', error }; disallowed IP -> { ok:false, reason:'disallowed', address }; else { ok:true, address, family }. The address/error carry forensic data so callers preserve their SSRF audit telemetry (proxy-image logs the blocked address / the DNS error).
export const buildPinnedDispatcher = (address: string, family: number): Agent // import { Agent } from 'undici'; connect.lookup pins the vetted address/family (handle BOTH options.all true and non-all callback forms), identical to proxy-image's current private helper

src/lib/utils/extract-open-graph.ts (pure, no I/O, no 'server-only')
export interface OpenGraphTags { title: string | null; description: string | null; siteName: string | null; imageUrl: string | null; faviconUrl: string | null; }
export const extractOpenGraph = (html: string, pageUrl: string): OpenGraphTags // slice to <head> (or byte cap); attribute-order-independent <meta> parse; entity-decode; priority title=og:title??twitter:title??<title>, description=og:description??twitter:description??meta[name=description], siteName=og:site_name??null, image=og:image??twitter:image, favicon=link[rel~=icon]; resolve relative image/favicon URLs against pageUrl

src/lib/validation/link-preview-schema.ts
export const linkPreviewSchema = z.object({ ... })
export type LinkPreview = { url: string; resolved: boolean; title: string | null; description: string | null; siteName: string | null; imageDataUri: string | null; faviconDataUri: string | null; }

src/lib/services/link-preview-service.ts (top: 'server-only')
export type LinkPreviewOutcome = { kind: 'ok'; preview: LinkPreview } | { kind: 'forbidden' };
export const getLinkPreview = (requestedUrl: string): Promise<LinkPreviewOutcome>
// Assumes requestedUrl already passed route validation (http(s), external, not literal-IP).
// vetHostname(host): 'disallowed' -> { kind:'forbidden' }; 'dns_failure' -> { kind:'ok', preview:{resolved:false, siteName:host, rest null} }.
// Fetch HTML with buildPinnedDispatcher + redirect:'manual' + AbortSignal.timeout(5000) + Accept:text/html + ~512KB streamed body cap; 3xx/non-2xx/non-text-html/empty -> resolved:false.
// extractOpenGraph(html,url); best-effort hero+favicon: SSRF-vet + pinned fetch (redirect manual, cap ~5MB, image/\*) -> sharp resize webp -> data URI, any failure -> null; sanitizeBioText (import from '@/lib/utils/sanitize-bio-html') on title/description/siteName; siteName falls back to hostname.
// Module-level LRUCache<string, LinkPreview> (import { LRUCache } from 'lru-cache'; max 200, ttl 3600000) keyed by normalized url; cache both ok and resolved:false.
// E2E_MODE (process.env.E2E_MODE) -> deterministic network-free { kind:'ok', preview:{resolved:false, siteName:hostname, rest null} } (no fetch/dns/sharp).

src/lib/config/rate-limit-tiers.ts (MODIFY — append, matching the file's existing tier shape)
export const linkPreviewLimiter = rateLimit({ interval: 60 \* 1000, uniqueTokenPerInterval: 500 });
export const LINK_PREVIEW_LIMIT = 30;

src/app/api/link-preview/route.ts
export const GET = withRateLimit(linkPreviewLimiter, LINK_PREVIEW_LIMIT)(withAdmin(async (request) => { ... }))
// imports: withRateLimit from '@/lib/decorators/with-rate-limit', withAdmin from '@/lib/decorators/with-auth', isInternalBioUrl from '@/lib/utils/is-internal-url', isIP from 'node:net', getLinkPreview + linkPreviewLimiter/LINK_PREVIEW_LIMIT.
// read request.nextUrl.searchParams.get('url'); missing/invalid URL/unsupported-protocol -> 400; isInternalBioUrl(url) -> 400; isIP(hostname)!==0 -> 403; getLinkPreview(url): kind 'forbidden' -> 403 { error }, kind 'ok' -> 200 NextResponse.json(preview).

src/lib/query-keys.ts (MODIFY — add to the existing key factory, following its shape)
linkPreview: (url: string) => ['linkPreview', url] as const
// Bare-function factory member (like the existing `purchaseStatus` precedent), NOT a { all, ... } group — do NOT prepend a namespace element. Task 6 implements + tests this exact flat shape.

src/app/hooks/use-link-preview-query.ts
export const useLinkPreviewQuery = (url: string, options?: QueryOptionsOverride<LinkPreview>): UseQueryResult<LinkPreview>
// import QueryOptionsOverride from '@/hooks/query-options'; queryKey queryKeys.linkPreview(url); queryFn fetches '/api/link-preview?url='+encodeURIComponent(url) forwarding the AbortSignal; staleTime 3600000; options spread LAST (queryKey/queryFn locked). jsdoc the behaviour + return.

src/app/components/forms/link-preview-card.tsx (top: 'use client')
export const LinkPreviewCard = ({ url, enabled }: { url: string; enabled: boolean }): JSX.Element
// useLinkPreviewQuery(url, { enabled }); isPending -> skeleton; resolved && imageDataUri -> hero plain <img src={imageDataUri} width height alt/>; render favicon+siteName, bold title, 2-3 line-clamped description; empty/error/!resolved -> fallback "No preview available — " + new URL(url).host. Semantic HTML + ARIA.

src/app/components/forms/bio-link-palette.tsx (MODIFY)
// For each EXTERNAL link (!isInternalBioUrl(link.url)) add a lucide-react Eye button in the row action cluster (before the Insert Plus button). Per-row open state (useState). useIsMobile() (from '@/hooks/use-mobile'): false -> shadcn HoverCard (@/components/ui/hover-card), true -> shadcn Popover (@/components/ui/popover); the Eye button is the trigger; content renders <LinkPreviewCard url={link.url} enabled={open} />. Internal links: no Eye. Keep existing Insert/Delete behaviour + drag payload unchanged.

---

### Task 1: Extract shared SSRF util + refactor proxy-image

**Files:**

- Create: `src/lib/utils/ssrf-fetch.ts`
- Create (test): `src/lib/utils/ssrf-fetch.spec.ts`
- Modify: `src/app/api/proxy-image/route.ts`
- Test (regression guard, unchanged): `src/app/api/proxy-image/route.spec.ts`

**Interfaces:**

- Consumes (pre-existing, not from another task):
  - `import { isDisallowedAddress } from '@/lib/utils/ip-guard'` — `(address: string) => boolean`.
  - `import { Agent } from 'undici'` — DNS-pinned dispatcher.
  - Existing route helpers left untouched: `buildAllowedDomains`, `validateUpstreamResponse`, `streamToBuffer`, `fetchAndBuffer`, and the `withRateLimit(pollingLimiter, POLLING_LIMIT)(withAuth(...))` wrapping.
- Produces (later tasks — the link-preview service + the proxy-image route — import these verbatim from `@/lib/utils/ssrf-fetch`):
  - `export type VettedAddress = { address: string; family: number }`
  - `export const vetHostname = (hostname: string): Promise<VetResult>` where `type VetResult = ({ ok: true } & VettedAddress) | { ok: false; reason: 'disallowed'; address: string } | { ok: false; reason: 'dns_failure'; error: unknown }` (module-private, not exported). The `address`/`error` carry the forensic data proxy-image's telemetry logs today.
  - `export const buildPinnedDispatcher = (address: string, family: number): Agent`

---

**Cycle A — create the shared util (TDD).**

- [ ] **Step 1: Write the failing test** — create `src/lib/utils/ssrf-fetch.spec.ts`. It runs under the Vitest `node` project (all `*.spec.ts` do), mocks `server-only`, `node:dns/promises`, and `undici` at the boundary (real `isDisallowedAddress` from `ip-guard`), and asserts the three `vetHostname` outcomes plus both `buildPinnedDispatcher` callback forms. One behavioural condition per test; no `expect` inside a conditional (the `if (typeof lookup !== 'function')` guard only narrows the type and throws — it never wraps an assertion).

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { buildPinnedDispatcher, vetHostname } from './ssrf-fetch';

  vi.mock('server-only', () => ({}));

  vi.mock('node:dns/promises', () => ({
    lookup: vi.fn(),
  }));

  type DispatcherLookup = (
    hostname: string,
    options: { all?: boolean },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number
    ) => void
  ) => void;

  // Capture the connection lookup installed on the pinned dispatcher. undici is
  // mocked so it never invokes the lookup itself — we exercise it directly to
  // assert it pins to the vetted address (and to cover both callback forms).
  const { capturedLookupRef } = vi.hoisted(() => ({
    capturedLookupRef: { current: undefined as DispatcherLookup | undefined },
  }));

  vi.mock('undici', () => ({
    // A class (not an arrow) so the util's `new Agent(...)` constructs — arrow
    // functions are not constructable; AGENTS.md routes constructor mocks to a class.
    Agent: class {
      close = vi.fn();
      constructor(opts: { connect?: { lookup?: DispatcherLookup } }) {
        capturedLookupRef.current = opts?.connect?.lookup;
      }
    },
  }));

  describe('vetHostname', () => {
    beforeEach(() => {
      capturedLookupRef.current = undefined;
    });

    it('returns ok with the vetted address for a public IP', async () => {
      const { lookup } = await import('node:dns/promises');
      vi.mocked(lookup).mockResolvedValueOnce({ address: '1.2.3.4', family: 4 } as never);

      const result = await vetHostname('example.com');

      expect(result).toEqual({ ok: true, address: '1.2.3.4', family: 4 });
    });

    it('returns reason "disallowed" when the resolved IP is private', async () => {
      const { lookup } = await import('node:dns/promises');
      vi.mocked(lookup).mockResolvedValueOnce({ address: '10.0.0.1', family: 4 } as never);

      const result = await vetHostname('internal.example.com');

      expect(result).toEqual({ ok: false, reason: 'disallowed', address: '10.0.0.1' });
    });

    it('returns reason "disallowed" for the cloud metadata address', async () => {
      const { lookup } = await import('node:dns/promises');
      vi.mocked(lookup).mockResolvedValueOnce({ address: '169.254.169.254', family: 4 } as never);

      const result = await vetHostname('metadata.example.com');

      expect(result).toEqual({ ok: false, reason: 'disallowed', address: '169.254.169.254' });
    });

    it('returns reason "disallowed" for a private IPv6 unique-local address', async () => {
      const { lookup } = await import('node:dns/promises');
      vi.mocked(lookup).mockResolvedValueOnce({ address: 'fd00::1', family: 6 } as never);

      const result = await vetHostname('v6.example.com');

      expect(result).toEqual({ ok: false, reason: 'disallowed', address: 'fd00::1' });
    });

    it('returns reason "dns_failure" carrying the caught error when lookup throws', async () => {
      const { lookup } = await import('node:dns/promises');
      const dnsError = new Error('ENOTFOUND');
      vi.mocked(lookup).mockRejectedValueOnce(dnsError);

      const result = await vetHostname('does-not-resolve.example.com');

      expect(result).toEqual({ ok: false, reason: 'dns_failure', error: dnsError });
    });
  });

  describe('buildPinnedDispatcher', () => {
    it('pins the lookup to the vetted address in the single-result callback form', () => {
      buildPinnedDispatcher('1.2.3.4', 4);

      const lookup = capturedLookupRef.current;
      if (typeof lookup !== 'function') {
        throw new Error('dispatcher lookup was not captured');
      }
      const callback = vi.fn();
      lookup('example.com', { all: false }, callback);

      expect(callback).toHaveBeenCalledWith(null, '1.2.3.4', 4);
    });

    it('pins the lookup to a single-element list in the all callback form', () => {
      buildPinnedDispatcher('5.6.7.8', 4);

      const lookup = capturedLookupRef.current;
      if (typeof lookup !== 'function') {
        throw new Error('dispatcher lookup was not captured');
      }
      const callback = vi.fn();
      lookup('example.com', { all: true }, callback);

      expect(callback).toHaveBeenCalledWith(null, [{ address: '5.6.7.8', family: 4 }]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL** — the module does not exist yet.

  ```bash
  pnpm exec vitest run src/lib/utils/ssrf-fetch.spec.ts
  ```

  Expected failure: the run errors before any test executes with `Failed to resolve import "./ssrf-fetch" from "src/lib/utils/ssrf-fetch.spec.ts"` (no such file). This confirms the test is wired to the not-yet-written module.

- [ ] **Step 3: Implement** — create `src/lib/utils/ssrf-fetch.ts`. `'server-only'` at the top; carries the MPL header (matches every sibling in `src/lib/utils/`). `vetHostname` mirrors the DNS-resolve + `isDisallowedAddress` logic that was private to `proxy-image/route.ts`, but returns a framework-free `VetResult` (no `NextResponse`, no logging — callers map the reason). `buildPinnedDispatcher` is the current proxy-image helper verbatim (both `options.all` branches), imported from `undici`.

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import { lookup } from 'node:dns/promises';

  import { Agent } from 'undici';

  import { isDisallowedAddress } from '@/lib/utils/ip-guard';

  import type { LookupAddress, LookupOptions } from 'node:dns';

  /** A DNS result that has already passed the SSRF blocklist. */
  export type VettedAddress = { address: string; family: number };

  type VetResult =
    | ({ ok: true } & VettedAddress)
    | { ok: false; reason: 'disallowed'; address: string }
    | { ok: false; reason: 'dns_failure'; error: unknown };

  /**
   * DNS-resolves `hostname` and vets the result against the SSRF blocklist
   * (`isDisallowedAddress`). Never returns a framework Response and never logs —
   * callers map the outcome to their own error and own their telemetry, so the
   * failure shapes carry the forensic data the caller needs to log:
   * - lookup throws          → { ok: false, reason: 'dns_failure', error }
   * - resolves to a blocked IP → { ok: false, reason: 'disallowed', address }
   * - otherwise              → { ok: true, address, family }
   */
  export const vetHostname = async (hostname: string): Promise<VetResult> => {
    try {
      const { address, family } = await lookup(hostname);
      if (isDisallowedAddress(address)) {
        return { ok: false, reason: 'disallowed', address };
      }
      return { ok: true, address, family };
    } catch (error) {
      return { ok: false, reason: 'dns_failure', error };
    }
  };

  /**
   * Builds an undici Agent whose DNS lookup is pinned to the already-vetted
   * address/family pair, closing the DNS-rebinding window that node's global
   * fetch would otherwise leave open between validation and socket connect.
   * TLS SNI still uses the original hostname so certificate validation is
   * unaffected. (M2)
   */
  export const buildPinnedDispatcher = (address: string, family: number): Agent => {
    const pinnedLookup = (
      _hostname: string,
      options: LookupOptions,
      callback: (
        err: NodeJS.ErrnoException | null,
        resolved: string | LookupAddress[],
        resolvedFamily?: number
      ) => void
    ): void => {
      if (options.all) {
        callback(null, [{ address, family }]);
      } else {
        callback(null, address, family);
      }
    };
    return new Agent({ connect: { lookup: pinnedLookup } });
  };
  ```

- [ ] **Step 4: Run it, expect PASS**

  ```bash
  pnpm exec vitest run src/lib/utils/ssrf-fetch.spec.ts
  ```

  All 7 tests pass (5 `vetHostname` + 2 `buildPinnedDispatcher`); both `options.all` branches and all three `VetResult` shapes are covered.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/utils/ssrf-fetch.ts src/lib/utils/ssrf-fetch.spec.ts
  git commit -m "refactor(bio): ♻️ shared SSRF vet+pin util"
  ```

---

**Cycle B — refactor proxy-image onto the shared util (behaviour-preserving; `route.spec.ts` is the guard).**

- [ ] **Step 6: Capture the green baseline** — the existing `src/app/api/proxy-image/route.spec.ts` is the regression guard for this refactor (it asserts every 400/403/415/413/502/500/200 branch plus both pinned-dispatcher callback forms). It must be green **before** the edit, so a post-edit failure unambiguously means the refactor changed behaviour.

  ```bash
  pnpm exec vitest run src/app/api/proxy-image/route.spec.ts
  ```

  Expected: all tests pass against the current route (no code change yet).

- [ ] **Step 7: Implement** — rewrite `src/app/api/proxy-image/route.ts`: delete the module-private `type VettedAddress`, `resolveAndVetAddress`, and `buildPinnedDispatcher`; import `vetHostname` + `buildPinnedDispatcher` from `@/lib/utils/ssrf-fetch`; drop the now-unused `lookup`/`isDisallowedAddress` value imports and the `node:dns` type import; demote `undici`'s `Agent` to a type-only import (it now appears only in `fetchAndBuffer`'s signature). Map `vetHostname`'s result to the exact same `NextResponse`s the private helper returned — `disallowed → 403 { error: 'Domain not allowed' }` (+ `loggers.s3.warn('[proxy-image] Blocked request resolving to disallowed IP', { address: vetted.address })`), `dns_failure → 502 { error: 'DNS lookup failed' }` (+ `loggers.s3.error('[proxy-image] DNS lookup failed', vetted.error)`). Because `vetHostname` no longer logs, the route forwards the `address`/`error` the result now carries so the telemetry stays byte-for-byte identical to today's (the existing `route.spec.ts` regression guard covers the 403/502 branches). Everything else (`buildAllowedDomains`, allowlist + literal-IP guards, `validateUpstreamResponse`, `streamToBuffer`, `fetchAndBuffer`, the `finally` dispatcher close, the `withRateLimit(...)(withAuth(...))` wrapping) is unchanged.

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { isIP } from 'node:net';

  import { type NextRequest, NextResponse } from 'next/server';

  import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
  import { withAuth } from '@/lib/decorators/with-auth';
  import { withRateLimit } from '@/lib/decorators/with-rate-limit';
  import { loggers } from '@/lib/utils/logger';
  import { buildPinnedDispatcher, vetHostname } from '@/lib/utils/ssrf-fetch';

  import type { Agent } from 'undici';

  // Upper bound on proxied image size. Prevents unbounded memory use from
  // attacker-supplied URLs that return huge bodies. 20 MB is far larger than
  // any legitimate album artwork.
  const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

  // Allowlist of hostnames. Exact match, or "<sub>.<allowed>" suffix match.
  // S3 is included because image cropper uses S3-hosted originals, but the
  // SSRF-via-redirect + DNS IP checks below still apply.
  const buildAllowedDomains = (): Set<string> => {
    const domains = new Set<string>([
      'cdn.fakefourrecords.com',
      's3.amazonaws.com',
      's3.us-east-1.amazonaws.com',
      's3.us-west-2.amazonaws.com',
      'fakefourrecords.com',
    ]);
    const cdnDomain = process.env.CDN_DOMAIN;
    if (cdnDomain) {
      try {
        domains.add(new URL(cdnDomain).hostname);
      } catch {
        // Ignore malformed CDN_DOMAIN
      }
    }
    return domains;
  };

  /**
   * Validates the upstream Response for redirect, status, content-type, and
   * content-length. Returns a NextResponse error on failure, or the resolved
   * contentType string on success.
   */
  const validateUpstreamResponse = (response: Response): NextResponse | string => {
    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json({ error: 'Upstream redirect rejected' }, { status: 502 });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream is not an image' }, { status: 415 });
    }
    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BODY_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }
    return contentType;
  };

  /**
   * Streams a Response body into a capped Buffer. Returns a NextResponse error
   * if the body is absent or exceeds MAX_PROXY_BODY_BYTES; otherwise returns
   * the accumulated Buffer.
   */
  const streamToBuffer = async (
    body: Response['body']
  ): Promise<Buffer<ArrayBuffer> | NextResponse> => {
    const reader = body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'Empty upstream body' }, { status: 502 });
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > MAX_PROXY_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: 'Image too large' }, { status: 413 });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, received);
  };

  /**
   * Issues the DNS-pinned fetch, validates the response (redirect, content-type,
   * size), streams the body into a capped buffer, and returns a NextResponse.
   * `redirect: 'manual'` prevents follow-on requests to attacker-controlled
   * Location headers (e.g. 302 → 169.254.169.254).
   */
  const fetchAndBuffer = async (url: string, dispatcher: Agent): Promise<NextResponse> => {
    const fetchInit = {
      headers: { Accept: 'image/*' },
      redirect: 'manual' as const,
      signal: AbortSignal.timeout(10_000),
      dispatcher,
    };
    const response = await fetch(url, fetchInit);

    const contentTypeOrError = validateUpstreamResponse(response);
    if (contentTypeOrError instanceof NextResponse) return contentTypeOrError;

    const bufferOrError = await streamToBuffer(response.body);
    if (bufferOrError instanceof NextResponse) return bufferOrError;

    return new NextResponse(bufferOrError, {
      status: 200,
      headers: {
        'Content-Type': contentTypeOrError,
        'Cache-Control': 'private, no-store',
      },
    });
  };

  /**
   * Proxy endpoint to fetch remote images and return them as blobs.
   * Used by the image cropper to sidestep CORS on CDN-hosted originals.
   * Rate-limited per IP: each request can pull up to 20MB from the upstream
   * CDN/S3, so an unthrottled authed client is a bandwidth-amplification
   * vector. The cropper loads one original per edit — 20/min is ample.
   */
  export const GET = withRateLimit(
    pollingLimiter,
    POLLING_LIMIT
  )(
    withAuth(async (request: NextRequest) => {
      const url = request.nextUrl.searchParams.get('url');

      if (!url) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
      }

      const hostname = parsedUrl.hostname;
      const allowedDomains = buildAllowedDomains();
      const isAllowedHost = [...allowedDomains].some(
        (domain) => hostname === domain || hostname.endsWith('.' + domain)
      );
      if (!isAllowedHost) {
        loggers.s3.warn('[proxy-image] Blocked request to non-allowed domain', { hostname });
        return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
      }

      // Reject literal IP hostnames — allowlist is strictly DNS-name based.
      if (isIP(parsedUrl.hostname) !== 0) {
        return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
      }

      const vetted = await vetHostname(hostname);
      if (!vetted.ok) {
        if (vetted.reason === 'disallowed') {
          // Preserve today's SSRF audit telemetry byte-for-byte: vetHostname no
          // longer logs, so the route forwards the blocked address it returned.
          loggers.s3.warn('[proxy-image] Blocked request resolving to disallowed IP', {
            address: vetted.address,
          });
          return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
        }
        loggers.s3.error('[proxy-image] DNS lookup failed', vetted.error);
        return NextResponse.json({ error: 'DNS lookup failed' }, { status: 502 });
      }

      const pinnedDispatcher = buildPinnedDispatcher(vetted.address, vetted.family);

      try {
        return await fetchAndBuffer(url, pinnedDispatcher);
      } catch (error) {
        loggers.s3.error('[proxy-image] Error proxying image', error);
        return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
      } finally {
        // Each request builds a fresh pinned dispatcher; close its connection
        // pool so it does not leak. The body is fully buffered before any return
        // above, so closing here cannot truncate the response.
        try {
          await pinnedDispatcher.close();
        } catch {
          // Best-effort cleanup — a close failure must not affect the response.
        }
      }
    })
  );
  ```

- [ ] **Step 8: Run the guard + the new util spec, expect PASS** — the route spec must stay byte-for-byte green (behaviour preserved), and the util spec still passes.

  ```bash
  pnpm exec vitest run src/app/api/proxy-image/route.spec.ts src/lib/utils/ssrf-fetch.spec.ts
  ```

  Expected: both files fully green. Note the route spec's `vi.mock('node:dns/promises', …)` and `vi.mock('undici', …)` now take effect **through** `ssrf-fetch.ts` (the route imports the shared helpers), so the DNS-private-IP → 403, DNS-throw → 502, and both dispatcher-lookup callback-form assertions still hold unchanged.

- [ ] **Step 9: Typecheck (catches dropped imports)** — confirms the removed `lookup`/`isDisallowedAddress`/`node:dns` imports and the `Agent` type-only demotion are consistent with no dangling references.

  ```bash
  pnpm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add src/app/api/proxy-image/route.ts
  git commit -m "refactor(bio): ♻️ proxy-image on shared SSRF util"
  ```

### Task 2: Head OG-meta extractor (`extract-open-graph.ts`)

**Files:**

- Create: `src/lib/utils/extract-open-graph.ts`
- Test: `src/lib/utils/extract-open-graph.spec.ts`

**Interfaces:**

- Consumes: nothing — pure util, no I/O, no cross-task dependency. Not
  `'server-only'` (safe to import anywhere).
- Produces (later tasks import these verbatim from
  `@/lib/utils/extract-open-graph`):
  - `export interface OpenGraphTags { title: string | null; description: string | null; siteName: string | null; imageUrl: string | null; faviconUrl: string | null; }`
  - `export const extractOpenGraph = (html: string, pageUrl: string): OpenGraphTags`
    — slice to `<head>` (or a byte cap when there is no `</head>`);
    attribute-order-independent `<meta>` parse; entity-decode; priority
    `title = og:title ?? twitter:title ?? <title>`,
    `description = og:description ?? twitter:description ?? meta[name=description]`,
    `siteName = og:site_name ?? null`, `imageUrl = og:image ?? twitter:image`,
    `faviconUrl = link[rel~=icon]`; relative `image`/`favicon` resolved against
    `pageUrl`. Consumed by `src/lib/services/link-preview-service.ts`.

- [ ] **Step 1: Write the failing test** — create
      `src/lib/utils/extract-open-graph.spec.ts` (pure util → no mocks; `describe`/`it`/`expect`
      are Vitest globals, never imported):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { extractOpenGraph } from './extract-open-graph';

const PAGE_URL = 'https://artist.test/path/page';

describe('extractOpenGraph', () => {
  it('parses a meta tag whose content precedes its property', () => {
    const html = `<head><meta content="Order A" property="og:title" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Order A');
  });

  it('parses a meta tag whose property precedes its content', () => {
    const html = `<head><meta property="og:title" content="Order B" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Order B');
  });

  it('parses single-quoted attribute values', () => {
    const html = `<head><meta property='og:title' content='Single Quoted' /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Single Quoted');
  });

  it('parses double-quoted attribute values', () => {
    const html = `<head><meta property="og:title" content="Double Quoted" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Double Quoted');
  });

  it('prefers og:title over twitter:title and the <title> tag', () => {
    const html = `<head>
      <title>Title Tag</title>
      <meta name="twitter:title" content="Twitter Title" />
      <meta property="og:title" content="OG Title" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('OG Title');
  });

  it('falls back to twitter:title when og:title is absent', () => {
    const html = `<head>
      <title>Title Tag</title>
      <meta name="twitter:title" content="Twitter Title" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Twitter Title');
  });

  it('falls back to the <title> tag when no og/twitter title exists', () => {
    const html = `<head><title>Title Tag</title></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Title Tag');
  });

  it('returns null title when no title source exists', () => {
    const html = `<head><meta property="og:description" content="d" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBeNull();
  });

  it('prefers og:description over twitter:description and meta[name=description]', () => {
    const html = `<head>
      <meta name="description" content="Plain Meta" />
      <meta name="twitter:description" content="Twitter Desc" />
      <meta property="og:description" content="OG Desc" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('OG Desc');
  });

  it('falls back to twitter:description when og:description is absent', () => {
    const html = `<head>
      <meta name="description" content="Plain Meta" />
      <meta name="twitter:description" content="Twitter Desc" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('Twitter Desc');
  });

  it('falls back to meta[name=description] when no og/twitter description exists', () => {
    const html = `<head><meta name="description" content="Plain Meta" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBe('Plain Meta');
  });

  it('extracts og:site_name', () => {
    const html = `<head><meta property="og:site_name" content="Example Site" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).siteName).toBe('Example Site');
  });

  it('returns null siteName when og:site_name is absent', () => {
    const html = `<head><meta property="og:title" content="t" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).siteName).toBeNull();
  });

  it('prefers og:image over twitter:image', () => {
    const html = `<head>
      <meta name="twitter:image" content="https://cdn.test/twitter.png" />
      <meta property="og:image" content="https://cdn.test/og.png" />
    </head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/og.png');
  });

  it('falls back to twitter:image when og:image is absent', () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.test/twitter.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/twitter.png');
  });

  it('decodes HTML entities in meta content', () => {
    const html = `<head><meta property="og:title" content="Ben &amp; Jerry&#39;s &lt;3" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe("Ben & Jerry's <3");
  });

  it('decodes HTML entities in the <title> tag text', () => {
    const html = `<head><title>Tom &amp; Jerry</title></head>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('Tom & Jerry');
  });

  it('resolves a relative og:image against the page URL', () => {
    const html = `<head><meta property="og:image" content="/img/hero.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://artist.test/img/hero.png');
  });

  it('leaves an absolute og:image unchanged', () => {
    const html = `<head><meta property="og:image" content="https://cdn.test/a.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).imageUrl).toBe('https://cdn.test/a.png');
  });

  it('extracts a rel="icon" favicon', () => {
    const html = `<head><link rel="icon" href="/favicon.ico" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://artist.test/favicon.ico');
  });

  it('extracts a rel="shortcut icon" favicon', () => {
    const html = `<head><link rel="shortcut icon" href="/fav.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://artist.test/fav.png');
  });

  it('extracts a rel="apple-touch-icon" favicon', () => {
    const html = `<head><link rel="apple-touch-icon" href="https://cdn.test/apple.png" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBe('https://cdn.test/apple.png');
  });

  it('returns null favicon when no icon link exists', () => {
    const html = `<head><link rel="stylesheet" href="/main.css" /></head>`;
    expect(extractOpenGraph(html, PAGE_URL).faviconUrl).toBeNull();
  });

  it('still extracts tags from a document with no <head> element', () => {
    const html = `<html><body><meta property="og:title" content="No Head" /></body></html>`;
    expect(extractOpenGraph(html, PAGE_URL).title).toBe('No Head');
  });

  it('returns all-null tags for a document with no meta/title/link tags', () => {
    const html = `<html><head></head><body><p>hello</p></body></html>`;
    expect(extractOpenGraph(html, PAGE_URL)).toEqual({
      title: null,
      description: null,
      siteName: null,
      imageUrl: null,
      faviconUrl: null,
    });
  });

  it('ignores meta tags beyond the head byte cap when there is no </head>', () => {
    const html =
      `<html><head><meta property="og:title" content="Top" />` +
      'x'.repeat(600 * 1024) +
      `<meta property="og:description" content="Below Cap" />`;
    expect(extractOpenGraph(html, PAGE_URL).description).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** —

```bash
pnpm exec vitest run src/lib/utils/extract-open-graph.spec.ts
```

Expected failure: the suite errors before assertions with
`Failed to resolve import "./extract-open-graph"` (the module does not exist
yet) / `Cannot find module './extract-open-graph'`.

- [ ] **Step 3: Implement** — create `src/lib/utils/extract-open-graph.ts`
      (MPL header; arrow functions only; named exports; explicit types; no `any`, no
      `!`; `matchAll` instead of a `while`-assignment loop to satisfy
      `no-cond-assign`):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Parsed subset of a page's `<head>` metadata (Open Graph / Twitter / HTML). */
export interface OpenGraphTags {
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

/** Region scanned for meta tags when the document has no `</head>` (~512 KB). */
const HEAD_BYTE_CAP = 512 * 1024;

/** Decode the HTML entities that appear in meta content (`&amp;` decoded last
 *  so an already-decoded `&` is never re-interpreted). */
const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-fA-F]+);/g, (_full: string, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_full: string, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** Attribute-order-independent parse of one tag's attributes into a
 *  lowercase-keyed, entity-decoded map. Handles double, single, and unquoted
 *  values. */
const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
  for (const match of tag.matchAll(attributePattern)) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[name.toLowerCase()] = decodeEntities(doubleQuoted ?? singleQuoted ?? unquoted ?? '');
  }
  return attributes;
};

/** Resolve a possibly-relative URL against the page URL; `null` if unusable. */
const resolveUrl = (value: string | null, base: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
};

/**
 * Extract a bounded set of `<head>` metadata from raw HTML. Pure (no I/O); the
 * caller (link-preview service) sanitizes the returned text. A parse miss
 * degrades to `null` rather than throwing.
 */
export const extractOpenGraph = (html: string, pageUrl: string): OpenGraphTags => {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html.slice(0, HEAD_BYTE_CAP) : html.slice(0, headEnd);

  const metaTags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));

  const metaContent = (key: string): string | null => {
    for (const attributes of metaTags) {
      const identifier = (attributes.property ?? attributes.name)?.toLowerCase();
      if (identifier === key) {
        const content = attributes.content?.trim();
        if (content) return content;
      }
    }
    return null;
  };

  const titleTagText = (): string | null => {
    const match = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const text = decodeEntities(match[1]).trim();
    return text.length > 0 ? text : null;
  };

  const faviconHref = (): string | null => {
    const linkTags = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) =>
      parseAttributes(match[0])
    );
    for (const attributes of linkTags) {
      const tokens = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
      if (tokens.some((token) => token.includes('icon'))) {
        const href = attributes.href?.trim();
        if (href) return href;
      }
    }
    return null;
  };

  return {
    title: metaContent('og:title') ?? metaContent('twitter:title') ?? titleTagText(),
    description:
      metaContent('og:description') ??
      metaContent('twitter:description') ??
      metaContent('description'),
    siteName: metaContent('og:site_name'),
    imageUrl: resolveUrl(metaContent('og:image') ?? metaContent('twitter:image'), pageUrl),
    faviconUrl: resolveUrl(faviconHref(), pageUrl),
  };
};
```

- [ ] **Step 4: Run it, expect PASS** —

```bash
pnpm exec vitest run src/lib/utils/extract-open-graph.spec.ts
```

All cases green. Then confirm no lint/type regression on the two new files:

```bash
pnpm exec eslint src/lib/utils/extract-open-graph.ts src/lib/utils/extract-open-graph.spec.ts --max-warnings 0
```

- [ ] **Step 5: Commit** —

```bash
git add src/lib/utils/extract-open-graph.ts src/lib/utils/extract-open-graph.spec.ts
git commit -m "feat(bio): ✨ og-unfurl head-meta extractor"
```

---

### Task 3: Link-preview Zod schema (`link-preview-schema.ts`)

**Files:**

- Create: `src/lib/validation/link-preview-schema.ts`
- Test: `src/lib/validation/link-preview-schema.spec.ts`

**Interfaces:**

- Consumes: only `zod` (`import { z } from 'zod'`). No cross-task dependency.
- Produces (later tasks import these verbatim from
  `@/lib/validation/link-preview-schema`):
  - `export const linkPreviewSchema = z.object({ ... })` — validated on the
    client by `useLinkPreviewQuery` before use.
  - `export type LinkPreview = { url: string; resolved: boolean; title: string | null; description: string | null; siteName: string | null; imageDataUri: string | null; faviconDataUri: string | null; }`
    (the inferred type of `linkPreviewSchema` is exactly this shape). Consumed by
    `src/lib/services/link-preview-service.ts`, `src/lib/query-keys.ts` callers,
    `src/app/hooks/use-link-preview-query.ts`, and
    `src/app/components/forms/link-preview-card.tsx`.

- [ ] **Step 1: Write the failing test** — create
      `src/lib/validation/link-preview-schema.spec.ts` (Vitest globals; no mocks —
      pure schema; one behavioural condition per test):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { linkPreviewSchema } from './link-preview-schema';

const resolvedPreview = {
  url: 'https://artist.test/page',
  resolved: true,
  title: 'A Title',
  description: 'A description',
  siteName: 'Artist Site',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: 'data:image/png;base64,BBBB',
};

const fallbackPreview = {
  url: 'https://artist.test/page',
  resolved: false,
  title: null,
  description: null,
  siteName: 'artist.test',
  imageDataUri: null,
  faviconDataUri: null,
};

describe('linkPreviewSchema', () => {
  it('accepts a fully-resolved preview', () => {
    expect(linkPreviewSchema.safeParse(resolvedPreview).success).toBe(true);
  });

  it('accepts a resolved:false fallback preview with null fields', () => {
    expect(linkPreviewSchema.safeParse(fallbackPreview).success).toBe(true);
  });

  it('returns the parsed url on a successful parse', () => {
    const parsed = linkPreviewSchema.parse(resolvedPreview);
    expect(parsed.url).toBe('https://artist.test/page');
  });

  it('rejects a preview missing the url field', () => {
    const { url: _url, ...rest } = resolvedPreview;
    expect(linkPreviewSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-boolean resolved field', () => {
    expect(linkPreviewSchema.safeParse({ ...resolvedPreview, resolved: 'yes' }).success).toBe(
      false
    );
  });

  it('rejects a numeric title (must be string or null)', () => {
    expect(linkPreviewSchema.safeParse({ ...resolvedPreview, title: 42 }).success).toBe(false);
  });

  it('rejects a missing imageDataUri field', () => {
    const { imageDataUri: _imageDataUri, ...rest } = resolvedPreview;
    expect(linkPreviewSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** —

```bash
pnpm exec vitest run src/lib/validation/link-preview-schema.spec.ts
```

Expected failure: `Failed to resolve import "./link-preview-schema"` /
`Cannot find module './link-preview-schema'` (module not created yet).

- [ ] **Step 3: Implement** — create
      `src/lib/validation/link-preview-schema.ts` (MPL header; named exports;
      `z.infer` for the type per the repo idiom in `bio-generation-schema.ts` — its
      inferred shape is exactly the `LinkPreview` contract):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Wire schema for the `GET /api/link-preview` response, validated on the client
 * (`useLinkPreviewQuery`) before use. `resolved:false` means the upstream fetch
 * or extraction degraded gracefully — only `siteName` (the host) is populated
 * and every other field is `null`; the card still renders the bare host.
 */
export const linkPreviewSchema = z.object({
  url: z.string(),
  resolved: z.boolean(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  imageDataUri: z.string().nullable(),
  faviconDataUri: z.string().nullable(),
});

/** Response body of `GET /api/link-preview` (see {@link linkPreviewSchema}). */
export type LinkPreview = z.infer<typeof linkPreviewSchema>;
```

- [ ] **Step 4: Run it, expect PASS** —

```bash
pnpm exec vitest run src/lib/validation/link-preview-schema.spec.ts
```

All cases green. Then confirm no lint/type regression on the two new files:

```bash
pnpm exec eslint src/lib/validation/link-preview-schema.ts src/lib/validation/link-preview-schema.spec.ts --max-warnings 0
```

- [ ] **Step 5: Commit** —

```bash
git add src/lib/validation/link-preview-schema.ts src/lib/validation/link-preview-schema.spec.ts
git commit -m "feat(bio): ✨ link-preview zod schema"
```

### Task 4: Link-preview service orchestration

Orchestrates one unfurl end-to-end: SSRF-vet the host, DNS-pinned page fetch,
hand-extract OG/Twitter metadata, best-effort hero + favicon thumbnails as webp
data URIs, sanitize the text, and cache by normalized URL. The route (a later
task) stays thin and just maps the outcome to HTTP status codes.

**Files:**

- Create: `src/lib/utils/thumbnail-data-uri.ts` (Cycle A)
- Test: `src/lib/utils/thumbnail-data-uri.spec.ts` (Cycle A — real `sharp`, `node-forks` pool)
- Modify: `vitest.config.ts` (Cycle A — register the new spec in `NATIVE_ADDON_SPECS`)
- Create: `src/lib/services/link-preview-service.ts` (Cycle B)
- Test: `src/lib/services/link-preview-service.spec.ts` (Cycle B)

**Interfaces:**

- Produces (Cycle A — consumed by the service in Cycle B):
  - `export const imageToWebpDataUri = (buffer: Buffer, width: number): Promise<string>`
    from `@/lib/utils/thumbnail-data-uri` (top: `'server-only'`) —
    `sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()`
    → `data:image/webp;base64,…`. `sharp` (default from `'sharp'`) lives here now
    (moved out of the service), so its real-addon assertions run under the
    `node-forks` pool.
- Consumes (created by earlier tasks in this plan):
  - `import { vetHostname, buildPinnedDispatcher } from '@/lib/utils/ssrf-fetch'`
    — `vetHostname(hostname: string): Promise<({ ok: true } & { address: string; family: number }) | { ok: false; reason: 'disallowed'; address: string } | { ok: false; reason: 'dns_failure'; error: unknown }>`
    (the service branches on `.ok`/`.reason` only — the `address`/`error` fields
    are additive and do not change the service's control flow);
    `buildPinnedDispatcher(address: string, family: number): Agent`.
  - `import { imageToWebpDataUri } from '@/lib/utils/thumbnail-data-uri'`
    (Cycle A) — the hero(320)/favicon(32) webp data-URI transform.
  - `import { extractOpenGraph } from '@/lib/utils/extract-open-graph'` —
    `extractOpenGraph(html: string, pageUrl: string): OpenGraphTags` where
    `OpenGraphTags = { title: string | null; description: string | null; siteName: string | null; imageUrl: string | null; faviconUrl: string | null }`.
  - `import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html'` —
    `sanitizeBioText(value: string): string`.
  - `import type { LinkPreview } from '@/lib/validation/link-preview-schema'` —
    `{ url: string; resolved: boolean; title: string | null; description: string | null; siteName: string | null; imageDataUri: string | null; faviconDataUri: string | null }`.
  - `LRUCache` from `'lru-cache'`; `Agent` type from `'undici'`.
- Produces (Cycle B — consumed by the `GET /api/link-preview` route task):
  - `export type LinkPreviewOutcome = { kind: 'ok'; preview: LinkPreview } | { kind: 'forbidden' }`
  - `export const getLinkPreview = (requestedUrl: string): Promise<LinkPreviewOutcome>`

> Note: Task 4 is split into two cycles (like Task 1). **Cycle A** extracts the
> testable thumbnail helper `imageToWebpDataUri` and asserts the REAL `sharp`
> transform under the `node-forks` pool (registered in `NATIVE_ADDON_SPECS`).
> **Cycle B** builds the service, which imports that helper; the service spec
> **mocks `@/lib/utils/thumbnail-data-uri`** (not `sharp`) at the boundary, so it
> runs under the default `node` Vitest project (`**/*.spec.ts`) with no native
> addon. There is no `sharp` mock here anymore — the real-`sharp` assertions live
> in Cycle A's `thumbnail-data-uri.spec.ts`.

---

**Cycle A — extract the thumbnail helper (real `sharp`, `node-forks` pool).**

- [ ] **Step 1: Write the failing test** — create `src/lib/utils/thumbnail-data-uri.spec.ts`. It exercises the REAL `sharp` transform (no mock), so it must run under the `node-forks` pool; it builds real input images with `sharp` (mirroring `image-quality.spec.ts`) and decodes the returned data-URI back with `sharp(...).metadata()` to assert real dimensions. `describe`/`it`/`expect`/`vi` are globals; `server-only` is mocked so the addon-backed helper imports cleanly.

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import sharp from 'sharp';

  import { imageToWebpDataUri } from './thumbnail-data-uri';

  vi.mock('server-only', () => ({}));

  // A real, decodable solid-colour image of the given size.
  const makeImage = (width: number, height: number): Promise<Buffer> =>
    sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

  // Decode a `data:image/webp;base64,…` URI back to sharp metadata.
  const dataUriMetadata = (dataUri: string): Promise<sharp.Metadata> => {
    const base64 = dataUri.replace(/^data:image\/webp;base64,/, '');
    return sharp(Buffer.from(base64, 'base64')).metadata();
  };

  describe('imageToWebpDataUri', () => {
    it('returns a webp data URI', async () => {
      const dataUri = await imageToWebpDataUri(await makeImage(640, 400), 320);

      expect(dataUri.startsWith('data:image/webp;base64,')).toBe(true);
    });

    it('encodes real bytes that decode back to a webp image', async () => {
      const dataUri = await imageToWebpDataUri(await makeImage(640, 400), 320);
      const metadata = await dataUriMetadata(dataUri);

      expect(metadata.format).toBe('webp');
    });

    it('downscales a favicon source to a 32px-wide webp', async () => {
      const dataUri = await imageToWebpDataUri(await makeImage(256, 256), 32);
      const metadata = await dataUriMetadata(dataUri);

      expect(metadata.width).toBe(32);
    });

    it('caps a hero source at the requested 320px width (never above source)', async () => {
      const dataUri = await imageToWebpDataUri(await makeImage(1200, 800), 320);
      const metadata = await dataUriMetadata(dataUri);

      expect(metadata.width).toBe(320);
    });

    it('does not enlarge a source narrower than the target width', async () => {
      const dataUri = await imageToWebpDataUri(await makeImage(120, 90), 320);
      const metadata = await dataUriMetadata(dataUri);

      expect(metadata.width).toBe(120);
    });
  });
  ```

- [ ] **Step 2: Register the spec under the `node-forks` pool** — `NATIVE_ADDON_SPECS` in `vitest.config.ts` is an allowlist (real-`sharp` specs need the `forks` pool; `vmThreads` cannot load the native addon). Add the new spec, or Step 3 runs it under the `node` project and fails to load `sharp` instead of failing on the missing module.

  Before (`vitest.config.ts` line 32):

  ```ts
  const NATIVE_ADDON_SPECS = ['**/image-quality.spec.ts'];
  ```

  After:

  ```ts
  const NATIVE_ADDON_SPECS = ['**/image-quality.spec.ts', '**/thumbnail-data-uri.spec.ts'];
  ```

- [ ] **Step 3: Run it, expect FAIL** — under the `node-forks` project; the helper module does not exist yet.

  ```bash
  pnpm exec vitest run --project node-forks src/lib/utils/thumbnail-data-uri.spec.ts
  ```

  Expected failure: the run errors while resolving the import — `Failed to resolve import "./thumbnail-data-uri"` / `Cannot find module './thumbnail-data-uri'` (0 tests collected).

- [ ] **Step 4: Implement** — create `src/lib/utils/thumbnail-data-uri.ts` (`'server-only'` + MPL header, matching `image-quality.ts`):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import sharp from 'sharp';

  /**
   * Downscale `buffer` to a `width`-wide webp and return it as a base64
   * `data:image/webp` URI. `withoutEnlargement` keeps a source narrower than
   * `width` at its original size (never upscaled); quality 70 balances the
   * inline payload size against legibility for a bounded preview thumbnail.
   *
   * @param buffer - Raw source image bytes (already SSRF-fetched + byte-capped).
   * @param width - Target width in px (hero 320, favicon 32).
   * @returns A `data:image/webp;base64,…` URI of the re-encoded image.
   */
  export const imageToWebpDataUri = async (buffer: Buffer, width: number): Promise<string> => {
    const output = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return `data:image/webp;base64,${output.toString('base64')}`;
  };
  ```

- [ ] **Step 5: Run it, expect PASS** — under the `node-forks` project:

  ```bash
  pnpm exec vitest run --project node-forks src/lib/utils/thumbnail-data-uri.spec.ts
  ```

  All 5 assertions pass: the output is a webp data-URI, decodes back to a real webp, downscales the favicon to 32px, caps the hero at 320px, and never upscales a smaller source.

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/utils/thumbnail-data-uri.ts src/lib/utils/thumbnail-data-uri.spec.ts vitest.config.ts
  git commit -m "feat(bio): ✨ webp data-uri thumbnail helper"
  ```

---

**Cycle B — the orchestration service (mocks the thumbnail helper).**

- [ ] **Step 7: Write the failing test** — the service imports `imageToWebpDataUri`; this spec mocks that helper (not `sharp`) at the boundary. Complete spec with real assertions:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getLinkPreview, type LinkPreviewOutcome } from './link-preview-service';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

vi.mock('server-only', () => ({}));

const vetHostnameMock = vi.fn();
const closeMock = vi.fn();
const buildPinnedDispatcherMock = vi.fn(() => ({ close: closeMock }));
vi.mock('@/lib/utils/ssrf-fetch', () => ({
  vetHostname: (hostname: string) => vetHostnameMock(hostname),
  buildPinnedDispatcher: (address: string, family: number) =>
    buildPinnedDispatcherMock(address, family),
}));

const extractOpenGraphMock = vi.fn();
vi.mock('@/lib/utils/extract-open-graph', () => ({
  extractOpenGraph: (html: string, pageUrl: string) => extractOpenGraphMock(html, pageUrl),
}));

const sanitizeBioTextMock = vi.fn((value: string) => `S:${value}`);
vi.mock('@/lib/utils/sanitize-bio-html', () => ({
  sanitizeBioText: (value: string) => sanitizeBioTextMock(value),
}));

// The service delegates the sharp transform to imageToWebpDataUri (its own
// real-sharp unit lives in Cycle A). Mock that helper here so this spec runs
// under the default `node` project with no native addon.
const imageToWebpDataUriMock = vi.fn();
vi.mock('@/lib/utils/thumbnail-data-uri', () => ({
  imageToWebpDataUri: (buffer: Buffer, width: number) => imageToWebpDataUriMock(buffer, width),
}));

const htmlResponse = (html: string): Response =>
  new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const imageResponse = (): Response =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });

// Route by extension: hero/favicon URLs end in `.png`; page URLs do not.
const routeFetch = (input: string): Promise<Response> =>
  input.endsWith('.png')
    ? Promise.resolve(imageResponse())
    : Promise.resolve(htmlResponse('<html></html>'));

const okTags = {
  title: 'Real Title',
  description: 'Real Desc',
  siteName: 'Example Site',
  imageUrl: 'https://cdn.example.com/hero.png',
  faviconUrl: 'https://cdn.example.com/favicon.png',
};

let fetchMock: ReturnType<typeof vi.fn>;

// Guard that narrows the union without an `expect` inside a conditional.
const expectPreview = (outcome: LinkPreviewOutcome): LinkPreview => {
  if (outcome.kind !== 'ok') throw new Error(`expected ok outcome, got ${outcome.kind}`);
  return outcome.preview;
};

beforeEach(() => {
  vetHostnameMock.mockResolvedValue({ ok: true, address: '93.184.216.34', family: 4 });
  closeMock.mockResolvedValue(undefined);
  extractOpenGraphMock.mockReturnValue({ ...okTags });
  imageToWebpDataUriMock.mockResolvedValue('data:image/webp;base64,d2VicA==');
  fetchMock = vi.fn(routeFetch);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getLinkPreview', () => {
  it('returns forbidden when the host resolves to a disallowed address', async () => {
    vetHostnameMock.mockResolvedValueOnce({ ok: false, reason: 'disallowed', address: '10.0.0.1' });

    const outcome = await getLinkPreview('https://forbidden.test/artist');

    expect(outcome).toEqual({ kind: 'forbidden' });
  });

  it('does not fetch when the host is forbidden', async () => {
    vetHostnameMock.mockResolvedValueOnce({ ok: false, reason: 'disallowed', address: '10.0.0.1' });

    await getLinkPreview('https://forbidden2.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to a host-only fallback on DNS failure', async () => {
    vetHostnameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'dns_failure',
      error: new Error('ENOTFOUND'),
    });

    const outcome = await getLinkPreview('https://dnsfail.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://dnsfail.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'dnsfail.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });

  it('does not fetch when DNS resolution fails', async () => {
    vetHostnameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'dns_failure',
      error: new Error('ENOTFOUND'),
    });

    await getLinkPreview('https://dnsfail2.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves an OG-tagged page to resolved:true', async () => {
    const preview = expectPreview(await getLinkPreview('https://resolved.test/artist'));

    expect(preview.resolved).toBe(true);
  });

  it('sanitizes the extracted title through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sanitize.test/artist'));

    expect(preview.title).toBe('S:Real Title');
  });

  it('sanitizes the extracted description through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sanitizedesc.test/artist'));

    expect(preview.description).toBe('S:Real Desc');
  });

  it('sanitizes the extracted site name through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sitename.test/artist'));

    expect(preview.siteName).toBe('S:Example Site');
  });

  it('encodes the hero image as a webp data URI', async () => {
    const preview = expectPreview(await getLinkPreview('https://heroimg.test/artist'));

    expect(preview.imageDataUri).toBe('data:image/webp;base64,d2VicA==');
  });

  it('encodes the favicon as a webp data URI', async () => {
    const preview = expectPreview(await getLinkPreview('https://favimg.test/artist'));

    expect(preview.faviconDataUri).toBe('data:image/webp;base64,d2VicA==');
  });

  it('falls the siteName back to the hostname when og:site_name is absent', async () => {
    extractOpenGraphMock.mockReturnValueOnce({ ...okTags, siteName: null });

    const preview = expectPreview(await getLinkPreview('https://nosite.test/artist'));

    expect(preview.siteName).toBe('nosite.test');
  });

  it('degrades to resolved:false on a redirect response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })
    );

    const preview = expectPreview(await getLinkPreview('https://redirect.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    const preview = expectPreview(await getLinkPreview('https://fivehundred.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on a non-HTML content type', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const preview = expectPreview(await getLinkPreview('https://json.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on an empty body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 200, headers: { 'Content-Type': 'text/html' } })
    );

    const preview = expectPreview(await getLinkPreview('https://empty.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to a host-only fallback when the page fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const outcome = await getLinkPreview('https://timeout.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://timeout.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'timeout.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });

  it('stops reading the page body once the byte cap is reached', async () => {
    const cancelSpy = vi.fn();
    const chunk = new Uint8Array(256 * 1024); // 256 KB per pull
    // A stream that never closes on its own: only the ~512 KB cap stops the read.
    const cappedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel: cancelSpy,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(cappedBody, { status: 200, headers: { 'Content-Type': 'text/html' } })
    );

    await getLinkPreview('https://capped.test/artist');

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('degrades to resolved:false when no tags are extractable', async () => {
    extractOpenGraphMock.mockReturnValueOnce({
      title: null,
      description: null,
      siteName: null,
      imageUrl: null,
      faviconUrl: null,
    });

    const preview = expectPreview(await getLinkPreview('https://notags.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('nulls the hero data URI when thumbnailing fails but keeps the preview resolved', async () => {
    imageToWebpDataUriMock.mockRejectedValue(new Error('thumbnail boom'));

    const preview = expectPreview(await getLinkPreview('https://herofail.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image host is disallowed', async () => {
    vetHostnameMock
      .mockResolvedValueOnce({ ok: true, address: '93.184.216.34', family: 4 }) // page host
      .mockResolvedValue({ ok: false, reason: 'disallowed', address: '10.0.0.1' }); // image hosts

    const preview = expectPreview(await getLinkPreview('https://badimg.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response is not an image', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response('nope', { status: 200, headers: { 'Content-Type': 'text/plain' } })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://notimage.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response exceeds the 5MB cap', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response(new Uint8Array(6 * 1024 * 1024), {
              status: 200,
              headers: { 'Content-Type': 'image/png' },
            })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://bigimg.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response is a redirect', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response(null, { status: 302, headers: { Location: 'https://evil.test/x.png' } })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://imgredirect.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('serves a cached preview on the second call without re-fetching', async () => {
    await getLinkPreview('https://cached.test/artist');
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getLinkPreview('https://cached.test/artist');

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('caches resolved:false negatives too', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await getLinkPreview('https://cachedneg.test/artist');
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getLinkPreview('https://cachedneg.test/artist');

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('short-circuits without any network call in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await getLinkPreview('https://e2e.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not vet the host in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await getLinkPreview('https://e2evet.test/artist');

    expect(vetHostnameMock).not.toHaveBeenCalled();
  });

  it('returns a deterministic host-only fallback in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const outcome = await getLinkPreview('https://e2e2.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://e2e2.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'e2e2.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });
});
```

- [ ] **Step 8: Run it, expect FAIL** — the service module does not exist yet:

```bash
pnpm exec vitest run src/lib/services/link-preview-service.spec.ts
```

Expected failure: the run errors while resolving the import —
`Failed to load url ./link-preview-service` /
`Cannot find module './link-preview-service'` (0 tests collected).

- [ ] **Step 9: Implement** — complete minimal service:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { LRUCache } from 'lru-cache';

import { extractOpenGraph } from '@/lib/utils/extract-open-graph';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import { buildPinnedDispatcher, vetHostname } from '@/lib/utils/ssrf-fetch';
import { imageToWebpDataUri } from '@/lib/utils/thumbnail-data-uri';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';
import type { Agent } from 'undici';

// The <head> we parse sits near the top of the document, so cap the page body.
const HTML_BYTE_CAP = 512 * 1024;
// Hero/favicon source images are capped before sharp ever touches them.
const IMAGE_BYTE_CAP = 5 * 1024 * 1024;
const HERO_WIDTH = 320;
const FAVICON_WIDTH = 32;
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Result of {@link getLinkPreview}. `forbidden` maps to the route's 403 (the
 * host resolved to a private/reserved address); every other outcome — including
 * upstream failures — is an `ok` carrying a (possibly `resolved:false`) preview
 * so the card always has something to render.
 */
export type LinkPreviewOutcome = { kind: 'ok'; preview: LinkPreview } | { kind: 'forbidden' };

// Caches successes AND resolved:false negatives by normalized URL to blunt
// repeat hovers and links shared across artists/admins. 1 h TTL mirrors the
// client hook's staleTime.
const previewCache = new LRUCache<string, LinkPreview>({ max: 200, ttl: 60 * 60 * 1000 });

// In E2E the service never touches the network — deterministic host-only result.
const isE2eMode = (): boolean => process.env.E2E_MODE === 'true';

// Host-only, resolved:false preview used for E2E, DNS failure, and every
// graceful upstream degradation (redirect, non-2xx, non-HTML, empty, no tags).
const buildFallbackPreview = (url: string, hostname: string): LinkPreview => ({
  url,
  resolved: false,
  title: null,
  description: null,
  siteName: hostname,
  imageDataUri: null,
  faviconDataUri: null,
});

// Streams a body into a Buffer, stopping once `cap` bytes are read. Returns null
// for an absent or empty body. `onOverCap` controls the over-cap behaviour:
// 'truncate' (page HTML — the <head> sits at the top, so a partial body is fine)
// keeps what was read; 'reject' (hero/favicon images — a truncated image is
// corrupt) returns null so the caller drops the image rather than handing sharp
// partial bytes.
const streamToBuffer = async (
  body: Response['body'],
  cap: number,
  onOverCap: 'truncate' | 'reject' = 'truncate'
): Promise<Buffer | null> => {
  const reader = body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    chunks.push(value);
    if (received >= cap) {
      await reader.cancel();
      if (onOverCap === 'reject') return null;
      break;
    }
  }
  if (received === 0) return null;
  return Buffer.concat(chunks, received);
};

// DNS-pinned, redirect-manual, timed-out, byte-capped page fetch. Returns the
// decoded HTML, or null for any redirect/non-2xx/non-HTML/empty response.
const fetchHtml = async (url: string, dispatcher: Agent): Promise<string | null> => {
  const fetchInit = {
    headers: { Accept: 'text/html' },
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    dispatcher,
  };
  const response = await fetch(url, fetchInit);
  if (response.status >= 300 && response.status < 400) return null;
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return null;
  const buffer = await streamToBuffer(response.body, HTML_BYTE_CAP);
  if (!buffer) return null;
  return buffer.toString('utf-8');
};

// Best-effort: SSRF-vet + DNS-pinned fetch a hero/favicon and re-encode it as a
// bounded webp data URI. Any failure (parse, protocol, vet, fetch, non-image,
// sharp) resolves to null so the card degrades to text-only.
const fetchImageDataUri = async (imageUrl: string, width: number): Promise<string | null> => {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const vetted = await vetHostname(parsed.hostname);
  if (!vetted.ok) return null;
  const dispatcher = buildPinnedDispatcher(vetted.address, vetted.family);
  try {
    const fetchInit = {
      headers: { Accept: 'image/*' },
      redirect: 'manual' as const,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      dispatcher,
    };
    const response = await fetch(imageUrl, fetchInit);
    if (response.status >= 300 && response.status < 400) return null;
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    // 'reject' over cap: a truncated image is corrupt, so drop it rather than
    // feed partial bytes to sharp.
    const buffer = await streamToBuffer(response.body, IMAGE_BYTE_CAP, 'reject');
    if (!buffer) return null;
    // `await` so a sharp/thumbnail rejection is caught here and degrades to null;
    // returning the promise unawaited would escape this try/catch.
    return await imageToWebpDataUri(buffer, width);
  } catch {
    return null;
  } finally {
    try {
      await dispatcher.close();
    } catch {
      // Best-effort cleanup — a close failure must not affect the result.
    }
  }
};

/**
 * Orchestrates a link-preview unfurl: SSRF-vet the host, DNS-pinned fetch the
 * page HTML, hand-extract OG/Twitter metadata, best-effort thumbnail the hero +
 * favicon into data URIs, sanitize the text fields, and cache the result by
 * normalized URL. Assumes `requestedUrl` already passed route validation
 * (http(s), external, not a literal IP).
 *
 * @param requestedUrl - The already-validated external URL to preview.
 * @returns `{ kind: 'forbidden' }` for a private/reserved host; otherwise
 *   `{ kind: 'ok', preview }` where `resolved:false` degrades gracefully to
 *   the bare host so the card always renders something.
 */
export const getLinkPreview = async (requestedUrl: string): Promise<LinkPreviewOutcome> => {
  const parsed = new URL(requestedUrl);
  const normalizedUrl = parsed.toString();
  const { hostname } = parsed;

  if (isE2eMode()) {
    return { kind: 'ok', preview: buildFallbackPreview(normalizedUrl, hostname) };
  }

  const cached = previewCache.get(normalizedUrl);
  if (cached) return { kind: 'ok', preview: cached };

  const vetted = await vetHostname(hostname);
  if (!vetted.ok && vetted.reason === 'disallowed') return { kind: 'forbidden' };
  if (!vetted.ok) {
    const preview = buildFallbackPreview(normalizedUrl, hostname);
    previewCache.set(normalizedUrl, preview);
    return { kind: 'ok', preview };
  }

  const dispatcher = buildPinnedDispatcher(vetted.address, vetted.family);
  let html: string | null = null;
  try {
    html = await fetchHtml(normalizedUrl, dispatcher);
  } catch {
    html = null;
  } finally {
    try {
      await dispatcher.close();
    } catch {
      // Best-effort cleanup — a close failure must not affect the result.
    }
  }

  const tags = html ? extractOpenGraph(html, normalizedUrl) : null;
  if (!tags || !(tags.title || tags.description || tags.imageUrl)) {
    const preview = buildFallbackPreview(normalizedUrl, hostname);
    previewCache.set(normalizedUrl, preview);
    return { kind: 'ok', preview };
  }

  const [imageDataUri, faviconDataUri] = await Promise.all([
    tags.imageUrl ? fetchImageDataUri(tags.imageUrl, HERO_WIDTH) : Promise.resolve(null),
    tags.faviconUrl ? fetchImageDataUri(tags.faviconUrl, FAVICON_WIDTH) : Promise.resolve(null),
  ]);

  const preview: LinkPreview = {
    url: normalizedUrl,
    resolved: true,
    title: tags.title ? sanitizeBioText(tags.title) : null,
    description: tags.description ? sanitizeBioText(tags.description) : null,
    siteName: tags.siteName ? sanitizeBioText(tags.siteName) : hostname,
    imageDataUri,
    faviconDataUri,
  };
  previewCache.set(normalizedUrl, preview);
  return { kind: 'ok', preview };
};
```

- [ ] **Step 10: Run it, expect PASS** — the full file, then the web gate:

```bash
pnpm exec vitest run src/lib/services/link-preview-service.spec.ts
pnpm run typecheck && pnpm run lint && pnpm run format
```

- [ ] **Step 11: Commit**:

```bash
git add src/lib/services/link-preview-service.ts src/lib/services/link-preview-service.spec.ts
git commit -m "feat(bio): ✨ link-preview unfurl service"
```

### Task 5: Rate-limit tier + `GET /api/link-preview` endpoint

**Files:**

- Modify: `src/lib/config/rate-limit-tiers.ts` (append `linkPreviewLimiter` + `LINK_PREVIEW_LIMIT`)
- Create: `src/app/api/link-preview/route.ts`
- Test: `src/app/api/link-preview/route.spec.ts`

**Interfaces:**

- Consumes:
  - `withRateLimit<TParams = unknown>(limiter: RateLimiter, limit: number) => (handler) => RouteHandler` — from `@/lib/decorators/with-rate-limit` (returns 429 when `limiter.check` rejects; skips the check when `process.env.E2E_MODE === 'true'`).
  - `withAdmin<TParams = unknown>(handler) => RouteHandler` — from `@/lib/decorators/with-auth` (401 unauthenticated, 403 non-admin, else calls handler).
  - `isInternalBioUrl(url: string): boolean` — from `@/lib/utils/is-internal-url`.
  - `isIP(input: string): number` — from `node:net` (0 = not an IP, 4 or 6 = literal IP).
  - `getLinkPreview(requestedUrl: string): Promise<LinkPreviewOutcome>` — from `@/lib/services/link-preview-service`, where `LinkPreviewOutcome = { kind: 'ok'; preview: LinkPreview } | { kind: 'forbidden' }` and `LinkPreview = { url: string; resolved: boolean; title: string | null; description: string | null; siteName: string | null; imageDataUri: string | null; faviconDataUri: string | null }`. **Assumes `requestedUrl` already passed route validation (http(s), external, not literal-IP).**
- Produces:
  - `export const linkPreviewLimiter` and `export const LINK_PREVIEW_LIMIT = 30` in `src/lib/config/rate-limit-tiers.ts` — the exact names the route (and the design's rate-limit contract) depend on.
  - `export const GET` in `src/app/api/link-preview/route.ts` — the admin-gated, rate-limited endpoint the `useLinkPreviewQuery` hook and the E2E test consume.

Notes for the implementer:

- The route spec runs under `// @vitest-environment node` and mocks `@/lib/config/rate-limit-tiers` (injecting a `{ check }` limiter) plus `@/lib/decorators/with-auth`, `@/lib/services/link-preview-service`, and `@/lib/utils/is-internal-url` — exactly mirroring the sibling `src/app/api/proxy-image/route.spec.ts`. The **real** `withRateLimit` decorator is exercised (that is what proves rate-limiting is wired), so the 429 path is a real assertion, not a mock of the decorator.
- `withAdmin` is stubbed to a pass-through so handler branches are testable directly; admin-gating is asserted structurally via a plain `vi.hoisted` ref set inside the mock factory (a plain object ref is immune to `clearMocks: true`, unlike `vi.fn` call history). The decorator's own 401/403 behaviour is covered by `src/lib/decorators/with-auth.spec.ts`.
- The config constants are branchless `export const` declarations (no new branches), and `tsc` (part of the gate) requires them to exist because `route.ts` imports them by name — so they ship in the same implementation step as the route.

---

- [ ] **Step 1: Write the failing test** — create `src/app/api/link-preview/route.spec.ts`:

```ts
// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as NextServerModule from 'next/server';
import { NextRequest } from 'next/server';

import { GET } from './route';

// Pass-through the admin gate so we can exercise the handler branches directly;
// withAdmin's own 401/403 logic is covered by with-auth.spec.ts. A plain hoisted
// ref (not a vi.fn) records that the route composed withAdmin — clearMocks:true
// wipes vi.fn call history between tests but leaves a plain object ref intact.
const { adminComposed } = vi.hoisted(() => ({ adminComposed: { current: false } }));
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: <H>(handler: H): H => {
    adminComposed.current = true;
    return handler;
  },
  withAuth: <H>(handler: H): H => handler,
}));

// Inject a limiter with a mockable check so the REAL withRateLimit decorator
// (imported by route.ts) drives the 429 path.
const limiterCheckMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  linkPreviewLimiter: { check: limiterCheckMock },
  LINK_PREVIEW_LIMIT: 30,
}));

// The service is the seam: route.ts only maps its outcome to a status code.
const getLinkPreviewMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/link-preview-service', () => ({
  getLinkPreview: getLinkPreviewMock,
}));

// Control internal/own-host classification deterministically (avoids depending
// on getApiBaseUrl in the node test env).
const isInternalBioUrlMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/is-internal-url', () => ({
  isInternalBioUrl: isInternalBioUrlMock,
}));

// Give NextResponse.json a real, parseable body (mirrors proxy-image.spec).
vi.mock('next/server', async (importOriginal) => {
  const original = (await importOriginal()) as typeof NextServerModule;
  class MockNextResponse extends Response {
    static json(
      body: unknown,
      init?: { status?: number; statusText?: string; headers?: Record<string, string> }
    ) {
      const headers = new Headers(init?.headers);
      headers.set('content-type', 'application/json');
      return new MockNextResponse(JSON.stringify(body), { ...init, headers });
    }
  }
  return { ...original, NextResponse: MockNextResponse };
});

const samplePreview = {
  url: 'https://example.com/article',
  resolved: true,
  title: 'Example Article',
  description: 'A short description.',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: null,
};

describe('GET /api/link-preview', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    isInternalBioUrlMock.mockReturnValue(false);
    getLinkPreviewMock.mockResolvedValue({ kind: 'ok', preview: samplePreview });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dummyContext = { params: Promise.resolve({}) };

  const createRequest = (url?: string): NextRequest => {
    const search = url ? `?url=${encodeURIComponent(url)}` : '';
    return new NextRequest(`http://localhost:3000/api/link-preview${search}`);
  };

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(createRequest('https://example.com/a'), dummyContext);

    expect(response.status).toBe(429);
  });

  it('does not call the service when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    await GET(createRequest('https://example.com/a'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the url parameter is missing', async () => {
    const response = await GET(createRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('URL parameter is required');
  });

  it('returns 400 for a malformed url', async () => {
    const response = await GET(createRequest('not-a-valid-url'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid URL');
  });

  it('returns 400 for an unsupported protocol', async () => {
    const response = await GET(createRequest('ftp://example.com/file'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported protocol');
  });

  it('returns 400 for an internal own-host url', async () => {
    isInternalBioUrlMock.mockReturnValue(true);

    const response = await GET(createRequest('https://mysite.com/releases/x'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Internal URLs are not previewable');
  });

  it('does not call the service for an internal url', async () => {
    isInternalBioUrlMock.mockReturnValue(true);

    await GET(createRequest('https://mysite.com/releases/x'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a literal IPv4 host', async () => {
    const response = await GET(createRequest('https://1.2.3.4/page'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('does not call the service for a literal IP host', async () => {
    await GET(createRequest('https://1.2.3.4/page'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a bracketed literal IPv6 host', async () => {
    const response = await GET(createRequest('http://[::1]/'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('does not call the service for a bracketed IPv6 host', async () => {
    await GET(createRequest('http://[::1]/'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the service reports the host is forbidden', async () => {
    getLinkPreviewMock.mockResolvedValue({ kind: 'forbidden' });

    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('returns 200 with the preview when the service resolves ok', async () => {
    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(samplePreview);
  });

  it('forwards the requested url to the service after validation passes', async () => {
    await GET(createRequest('https://example.com/article'), dummyContext);

    expect(getLinkPreviewMock).toHaveBeenCalledWith('https://example.com/article');
  });

  it('degrades to a 200 host-only fallback when the service throws', async () => {
    getLinkPreviewMock.mockRejectedValue(new Error('service boom'));

    const response = await GET(createRequest('https://example.com/article'), dummyContext);

    expect(response.status).toBe(200);
  });

  it('returns an unresolved host-only body when the service throws', async () => {
    getLinkPreviewMock.mockRejectedValue(new Error('service boom'));

    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(data).toEqual({
      url: 'https://example.com/article',
      resolved: false,
      title: null,
      description: null,
      siteName: 'example.com',
      imageDataUri: null,
      faviconDataUri: null,
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — run:

```bash
pnpm exec vitest run src/app/api/link-preview/route.spec.ts
```

Expected failure: the suite fails to collect because the module under test does not exist yet — `Error: Failed to load url ./route` / `Cannot find module './route'` for the `import { GET } from './route'` line. (Once `route.ts` exists but `linkPreviewLimiter`/`LINK_PREVIEW_LIMIT` are still missing from the real tiers file, `pnpm run typecheck` additionally reports `Module '"@/lib/config/rate-limit-tiers"' has no exported member 'linkPreviewLimiter'`.)

- [ ] **Step 3: Implement** — first append the tier to `src/lib/config/rate-limit-tiers.ts`, immediately after the `BIO_CALLBACK_LIMIT` block (keep the existing file's `rateLimit({ interval, uniqueTokenPerInterval })` shape):

```ts
/** Link-preview unfurl (admin bio editor) — 30 requests per minute. */
export const linkPreviewLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const LINK_PREVIEW_LIMIT = 30;
```

Then create `src/app/api/link-preview/route.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isIP } from 'node:net';

import { type NextRequest, NextResponse } from 'next/server';

import { LINK_PREVIEW_LIMIT, linkPreviewLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { getLinkPreview } from '@/lib/services/link-preview-service';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

/**
 * Admin-gated, rate-limited OG-unfurl endpoint for the bio-editor link palette.
 *
 * Validates the `url` query param (required, absolute `http(s)`, external, not a
 * literal-IP host) before delegating to the SSRF-hardened `getLinkPreview`
 * service, which owns the DNS-vet + pinned fetch + extraction + caching. Only
 * our-side input errors are non-200: malformed/internal URL → 400, literal-IP
 * or private-resolving host → 403, rate limit → 429. Every upstream failure
 * degrades to `200 { resolved:false }` so the card always renders something.
 */
export const GET = withRateLimit(
  linkPreviewLimiter,
  LINK_PREVIEW_LIMIT
)(
  withAdmin(async (request: NextRequest) => {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    if (isInternalBioUrl(url)) {
      return NextResponse.json({ error: 'Internal URLs are not previewable' }, { status: 400 });
    }

    // Reject literal-IP hostnames outright, including bracketed IPv6 literals:
    // `new URL('http://[::1]/').hostname === '[::1]'` and `isIP('[::1]') === 0`,
    // so the brackets must be stripped or the guard never fires. DNS-name hosts
    // are vetted downstream.
    const rawHost = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    if (isIP(rawHost) !== 0) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    try {
      const outcome = await getLinkPreview(url);
      if (outcome.kind === 'forbidden') {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
      }

      return NextResponse.json(outcome.preview);
    } catch {
      // The service already degrades every upstream failure internally, but a
      // defensive catch guarantees an unexpected throw never surfaces a raw 500:
      // only our-side input errors are non-200 (400/403/429), so fall back to a
      // host-only resolved:false preview and still return 200.
      return NextResponse.json({
        url,
        resolved: false,
        title: null,
        description: null,
        siteName: parsedUrl.hostname,
        imageDataUri: null,
        faviconDataUri: null,
      });
    }
  })
);
```

- [ ] **Step 4: Run it, expect PASS** — run:

```bash
pnpm exec vitest run src/app/api/link-preview/route.spec.ts && pnpm run typecheck
```

Every `it` passes and `tsc` is clean (the newly-exported `linkPreviewLimiter`/`LINK_PREVIEW_LIMIT` resolve the route's imports).

- [ ] **Step 5: Commit** — run:

```bash
git add src/lib/config/rate-limit-tiers.ts src/app/api/link-preview/route.ts src/app/api/link-preview/route.spec.ts
git commit -m "feat(bio): ✨ link-preview endpoint + tier"
```

### Task 6: `linkPreview` query key + `useLinkPreviewQuery` hook

**Files:**

- Modify: `src/lib/query-keys.ts` — add the `linkPreview(url)` entry to the factory.
- Create: `src/app/hooks/use-link-preview-query.ts`
- Test: `src/app/hooks/use-link-preview-query.spec.ts`

**Interfaces:**

- Consumes:
  - `queryKeys` from `@/lib/query-keys` (this task adds `linkPreview`).
  - `linkPreviewSchema`, `type LinkPreview` from `@/lib/validation/link-preview-schema` (authored earlier in the plan).
  - `fetchAndParse` from `./fetch-and-parse` (existing helper: `fetchAndParse<T>(url, schema, { signal, cache?, errorMessage? }): Promise<T>`).
  - `type QueryOptionsOverride` from `./query-options`.
- Produces:
  - `queryKeys.linkPreview: (url: string) => readonly ['linkPreview', string]`
  - `useLinkPreviewQuery(url: string, options?: QueryOptionsOverride<LinkPreview>): UseQueryResult<LinkPreview>` — consumed by Task 7's `LinkPreviewCard`.

- [ ] **Step 1: Write the failing test** — the hook wraps `useQuery` (mocked to capture options) and fetches through `fetchAndParse` (mocked at the boundary). Asserts the key shape (which forces the `query-keys` edit), the 1 h `staleTime` default, options-spread-last, and the encoded-URL + signal forwarding.

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

import { useLinkPreviewQuery } from './use-link-preview-query';

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockFetchAndParse = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock('./fetch-and-parse', () => ({
  fetchAndParse: (...args: unknown[]) => mockFetchAndParse(...args),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  staleTime: number;
  enabled?: boolean;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<LinkPreview>;
}

const PREVIEW: LinkPreview = {
  url: 'https://example.com',
  resolved: true,
  title: 'Example',
  description: 'An example page',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: null,
};

describe('useLinkPreviewQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ isPending: false, isError: false, data: PREVIEW });
    mockFetchAndParse.mockResolvedValue(PREVIEW);
  });

  it('keys the query by the requested url', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.queryKey).toEqual(['linkPreview', 'https://example.com']);
  });

  it('caches previews for one hour by default', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(3_600_000);
  });

  it('leaves the query disabled until the caller enables it', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com', { enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('lets a caller override the staleTime default', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com', { staleTime: 0 }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(0);
  });

  it('fetches the encoded url through fetchAndParse forwarding the signal', async () => {
    renderHook(() => useLinkPreviewQuery('https://example.com/a b'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();
    await options.queryFn({ signal });

    expect(mockFetchAndParse).toHaveBeenCalledWith(
      '/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa%20b',
      expect.anything(),
      { signal, errorMessage: 'Failed to fetch link preview' }
    );
  });

  it('resolves the queryFn to the parsed preview', async () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual(PREVIEW);
  });

  it('returns the useQuery result verbatim', () => {
    const { result } = renderHook(() => useLinkPreviewQuery('https://example.com'));

    expect(result.current.data).toEqual(PREVIEW);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — the hook module does not exist yet and `queryKeys.linkPreview` is undefined.

```bash
pnpm exec vitest run src/app/hooks/use-link-preview-query.spec.ts
```

Expected failure: `Failed to resolve import "./use-link-preview-query"` (module not created yet); once the file stub exists it fails on `expect(options.queryKey).toEqual(['linkPreview', 'https://example.com'])` because `queryKeys.linkPreview is not a function`.

- [ ] **Step 3: Implement** — add the key factory entry, then the hook.

First, in `src/lib/query-keys.ts`, add the `linkPreview` factory as a direct member of the `queryKeys` object (the hook contract calls `queryKeys.linkPreview(url)` directly, so it is a top-level function, not a nested group). Insert it immediately after the closing `},` of the `chat` group and before the final `} as const;`:

```ts
  chat: {
    // …existing chat group unchanged…
    userMessages: (userId: string) => [...queryKeys.chat.all, 'userMessages', userId] as const,
  },
  /** Unfurl preview for a single external bio link, keyed by the requested URL. */
  linkPreview: (url: string) => ['linkPreview', url] as const,
} as const;
```

Then create `src/app/hooks/use-link-preview-query.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { linkPreviewSchema, type LinkPreview } from '@/lib/validation/link-preview-schema';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Client freshness window for a fetched preview — matches the server LRU TTL
 *  (1 h) so repeat opens of a link's card serve from cache, never the network. */
const LINK_PREVIEW_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * Fetches the unfurl preview for one external URL from
 * `/api/link-preview?url=<encoded>`, validating the body against
 * `linkPreviewSchema` and forwarding the TanStack `AbortSignal` so the request
 * cancels when the card closes, the query is invalidated, or a superseding
 * fetch starts.
 */
const fetchLinkPreview = (url: string, signal?: AbortSignal): Promise<LinkPreview> =>
  fetchAndParse(`/api/link-preview?url=${encodeURIComponent(url)}`, linkPreviewSchema, {
    signal,
    errorMessage: 'Failed to fetch link preview',
  });

/**
 * Lazily fetches an OG-unfurl preview for a single external bio link. Intended
 * to be driven by a card's open state via the `enabled` override: the query
 * stays idle until the admin opens the preview, then fetches once and — thanks
 * to the 1 h `staleTime` matching the server LRU TTL — serves subsequent opens
 * from cache with no network round-trip.
 *
 * @param url - The external URL to unfurl; forwarded encoded to the endpoint.
 * @param options - Caller overrides spread last into `useQuery` (notably
 * `enabled`); `queryKey`/`queryFn` stay locked.
 * @returns The full TanStack `UseQueryResult` (`isPending`, `isError`, `data`).
 */
export const useLinkPreviewQuery = (
  url: string,
  options: QueryOptionsOverride<LinkPreview> = {}
): UseQueryResult<LinkPreview> =>
  useQuery({
    queryKey: queryKeys.linkPreview(url),
    queryFn: ({ signal }) => fetchLinkPreview(url, signal),
    staleTime: LINK_PREVIEW_STALE_TIME_MS,
    ...options,
  });
```

- [ ] **Step 4: Run it, expect PASS**

```bash
pnpm exec vitest run src/app/hooks/use-link-preview-query.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/app/hooks/use-link-preview-query.ts src/app/hooks/use-link-preview-query.spec.ts
git commit -m "feat(bio): ✨ link-preview query hook"
```

---

### Task 7: `LinkPreviewCard` component

**Files:**

- Create: `src/app/components/forms/link-preview-card.tsx`
- Test: `src/app/components/forms/link-preview-card.spec.tsx`
- Modify: `eslint.config.mjs` — extend the `@next/next/no-img-element: 'off'` file scope to cover the card (the hero is a bounded, self-generated `data:` webp — no remote host to enumerate in `images.remotePatterns`, so `next/image` is genuinely inapplicable, exactly like the bio-figure NodeView).

**Interfaces:**

- Consumes:
  - `useLinkPreviewQuery(url, { enabled })` from `@/app/hooks/use-link-preview-query` (Task 6).
  - `type LinkPreview` from `@/lib/validation/link-preview-schema`.
  - `Skeleton` from `@/app/components/ui/skeleton`.
- Produces:
  - `LinkPreviewCard({ url, enabled }: { url: string; enabled: boolean }): JSX.Element` — consumed by Task 8's `BioLinkPalette`.

- [ ] **Step 1: Write the failing test** — mock the query hook and assert the loading, resolved (hero + favicon + siteName + bold title + description), and fallback states, plus that `enabled` is forwarded.

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

import { LinkPreviewCard } from './link-preview-card';

const mockUseLinkPreviewQuery = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-link-preview-query', () => ({
  useLinkPreviewQuery: (url: string, options: { enabled: boolean }) =>
    mockUseLinkPreviewQuery(url, options),
}));

const RESOLVED: LinkPreview = {
  url: 'https://example.com/page',
  resolved: true,
  title: 'A Great Page',
  description: 'The most descriptive description.',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,SGVybw==',
  faviconDataUri: 'data:image/png;base64,RmF2',
};

describe('LinkPreviewCard', () => {
  afterEach(() => mockUseLinkPreviewQuery.mockReset());

  it('shows a loading skeleton while the query is pending', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('status', { name: 'Loading link preview' })).toBeInTheDocument();
  });

  it('forwards the enabled flag to the query hook', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(mockUseLinkPreviewQuery).toHaveBeenCalledWith('https://example.com/page', {
      enabled: true,
    });
  });

  it('renders the hero thumbnail from the data URI', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('img', { name: 'A Great Page' })).toHaveAttribute(
      'src',
      'data:image/webp;base64,SGVybw=='
    );
  });

  it('renders the title as a heading', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByRole('heading', { name: 'A Great Page' })).toBeInTheDocument();
  });

  it('renders the description', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('The most descriptive description.')).toBeInTheDocument();
  });

  it('renders the site name', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: RESOLVED, isPending: false, isError: false });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('falls back to the bare host when the preview is unresolved', () => {
    mockUseLinkPreviewQuery.mockReturnValue({
      data: { ...RESOLVED, resolved: false },
      isPending: false,
      isError: false,
    });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('shows the no-preview message when the query errors', () => {
    mockUseLinkPreviewQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.getByText(/No preview available/)).toBeInTheDocument();
  });

  it('omits any image when a resolved preview has no thumbnail or favicon', () => {
    mockUseLinkPreviewQuery.mockReturnValue({
      data: { ...RESOLVED, imageDataUri: null, faviconDataUri: null },
      isPending: false,
      isError: false,
    });

    render(<LinkPreviewCard url="https://example.com/page" enabled />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — the component module does not exist yet.

```bash
pnpm exec vitest run src/app/components/forms/link-preview-card.spec.tsx
```

Expected failure: `Failed to resolve import "./link-preview-card"` (module not created).

- [ ] **Step 3: Implement** — first extend the ESLint scope, then create the component.

In `eslint.config.mjs`, update the existing `no-img-element` override (currently `files: ['src/app/components/ui/bio-figure-node-view.tsx', 'src/app/global-error.tsx']`) to also list the card, and extend the explanatory comment:

```js
  // TipTap NodeView for in-editor bio figures: images come from arbitrary
  // scraped remote hosts that cannot be enumerated in `images.remotePatterns`,
  // so `next/image` is genuinely inapplicable — the editor-only plain `<img>`
  // is intentional. global-error likewise replaces the crashed root layout and
  // must stay dependency-light (no next/image) — its heading is a plain <img>.
  // link-preview-card renders a bounded, self-generated `data:` webp thumbnail
  // (no remote host to enumerate), so `next/image` adds nothing there either.
  {
    files: [
      'src/app/components/ui/bio-figure-node-view.tsx',
      'src/app/global-error.tsx',
      'src/app/components/forms/link-preview-card.tsx',
    ],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
```

Then create `src/app/components/forms/link-preview-card.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { Skeleton } from '@/app/components/ui/skeleton';
import { useLinkPreviewQuery } from '@/app/hooks/use-link-preview-query';

interface LinkPreviewCardProps {
  url: string;
  enabled: boolean;
}

/** Best-effort host label for the fallback state; never throws on a bad URL. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Body of a link's unfurl preview, shared by the desktop HoverCard and the
 * mobile Popover in `BioLinkPalette`. Lazily fetches via `useLinkPreviewQuery`
 * (gated by `enabled` = the card's open state): a pending query shows a
 * skeleton, a resolved preview shows the hero thumbnail (a self-generated
 * `data:` URI — `next/image` is unnecessary for a bounded inline image),
 * favicon, site name, bold title and a line-clamped description, and any
 * failure or unresolved response degrades to the bare host.
 *
 * @param url - The external URL being previewed.
 * @param enabled - Whether the card is open; drives the lazy query.
 * @returns The preview card body.
 */
export const LinkPreviewCard = ({ url, enabled }: LinkPreviewCardProps): JSX.Element => {
  const { data, isPending, isError } = useLinkPreviewQuery(url, { enabled });

  if (enabled && isPending) {
    return (
      <div role="status" aria-label="Loading link preview" className="space-y-2">
        <Skeleton className="my-0 h-28 w-full" />
        <Skeleton className="my-0 h-3 w-1/3" />
        <Skeleton className="my-0 h-4 w-3/4" />
      </div>
    );
  }

  if (isError || !data || !data.resolved) {
    return (
      <p className="text-muted-foreground text-xs">
        No preview available — <span className="break-all">{hostOf(url)}</span>
      </p>
    );
  }

  const { title, description, siteName, imageDataUri, faviconDataUri } = data;

  return (
    <article className="space-y-2">
      {imageDataUri && (
        <img
          src={imageDataUri}
          alt={title ?? siteName ?? hostOf(url)}
          width={320}
          height={168}
          className="h-auto w-full border-2 border-black object-cover"
        />
      )}
      <div className="flex items-center gap-1.5">
        {faviconDataUri && (
          <img src={faviconDataUri} alt="" width={16} height={16} className="size-4 shrink-0" />
        )}
        <span className="text-muted-foreground truncate text-xs">{siteName ?? hostOf(url)}</span>
      </div>
      {title && <h4 className="text-sm leading-snug font-bold">{title}</h4>}
      {description && <p className="text-muted-foreground line-clamp-3 text-xs">{description}</p>}
    </article>
  );
};
```

- [ ] **Step 4: Run it, expect PASS**

```bash
pnpm exec vitest run src/app/components/forms/link-preview-card.spec.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/app/components/forms/link-preview-card.tsx src/app/components/forms/link-preview-card.spec.tsx eslint.config.mjs
git commit -m "feat(bio): ✨ link-preview card component"
```

---

### Task 8: Eye trigger + HoverCard/Popover in `BioLinkPalette`

**Files:**

- Modify: `src/app/components/forms/bio-link-palette.tsx`
- Test: `src/app/components/forms/bio-link-palette.spec.tsx` (extend the existing spec)

**Interfaces:**

- Consumes:
  - `LinkPreviewCard` from `./link-preview-card` (Task 7).
  - `useIsMobile` from `@/hooks/use-mobile`.
  - `HoverCard`, `HoverCardTrigger`, `HoverCardContent` from `@/app/components/ui/hover-card`.
  - `Popover`, `PopoverTrigger`, `PopoverContent` from `@/app/components/ui/popover`.
  - `Eye` from `lucide-react`; `isInternalBioUrl` from `@/lib/utils/is-internal-url` (already imported).
- Produces: no new exports — extends the existing `BioLinkPalette` public component (`links`, `onDelete`, `onInsert`, `disabled` props unchanged).

- [ ] **Step 1: Write the failing test** — replace the existing spec with this superset: it keeps every current assertion (tiles, badges, external icon, delete, drag payload, disabled, filter/insert) and adds the Eye-trigger, HoverCard-vs-Popover, url-passthrough, lazy-`enabled`, and disabled-trigger cases. `useIsMobile`, the shadcn `HoverCard`/`Popover` wrappers, and `LinkPreviewCard` are mocked at their boundaries so the row wiring is asserted deterministically without driving Radix portals/timers.

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { BioLinkPalette } from './bio-link-palette';

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

const mockIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

vi.mock('./link-preview-card', () => ({
  LinkPreviewCard: ({ url, enabled }: { url: string; enabled: boolean }) => (
    <div data-testid="link-preview-card" data-url={url} data-enabled={String(enabled)} />
  ),
}));

vi.mock('@/app/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-hover-card">{children}</div>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-popover">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const LINKS: BioStatusLink[] = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X', kind: 'wikipedia' },
  { id: 'l2', label: 'Sad, Fat Luck', url: '/releases/r1', kind: 'release' },
];

const FILTER_LINKS: BioStatusLink[] = [
  { id: 'l1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ceschi', kind: 'wikipedia' },
  {
    id: 'l2',
    label: 'Ceschi on Bandcamp',
    url: 'https://ceschi.bandcamp.com',
    kind: 'streaming',
  },
];

describe('BioLinkPalette', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false));

  it('renders one tile per link with its kind badge', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByText('Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('Sad, Fat Luck')).toBeInTheDocument();
    expect(screen.getByText('wikipedia')).toBeInTheDocument();
    expect(screen.getByText('release')).toBeInTheDocument();
  });

  it('renders square draggable tiles with no rounded corners', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const tile = screen.getByText('Wikipedia').closest('li') as HTMLElement;
    expect(tile.className).not.toMatch(/rounded/);
  });

  it('shows the external icon only for external links', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const internalTile = screen.getByText('Sad, Fat Luck').closest('li');
    expect(internalTile?.querySelector('[data-external-icon]')).toBeNull();
  });

  it('shows the external icon for external links', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const externalTile = screen.getByText('Wikipedia').closest('li');
    expect(externalTile?.querySelector('[data-external-icon]')).not.toBeNull();
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const onDelete = vi.fn();
    render(<BioLinkPalette links={LINKS} onDelete={onDelete} onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete link Wikipedia' }));
    expect(onDelete).toHaveBeenCalledWith('l1');
  });

  it('sets the link drag payload on dragstart', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByText('Wikipedia').closest('li') as HTMLElement, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(
      BIO_LINK_DRAG_MIME,
      JSON.stringify({
        label: 'Wikipedia',
        url: 'https://en.wikipedia.org/wiki/X',
        kind: 'wikipedia',
        isExternal: true,
      })
    );
  });

  it('sets isExternal false for an internal link in the drag payload', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByText('Sad, Fat Luck').closest('li') as HTMLElement, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(
      BIO_LINK_DRAG_MIME,
      JSON.stringify({
        label: 'Sad, Fat Luck',
        url: '/releases/r1',
        kind: 'release',
        isExternal: false,
      })
    );
  });

  it('disables the delete button when disabled prop is true', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled();
  });

  it('renders the count, filters by text, and inserts on click', async () => {
    const onInsert = vi.fn();
    render(<BioLinkPalette links={FILTER_LINKS} onDelete={vi.fn()} onInsert={onInsert} />);
    expect(screen.getByText(/Discovered links \(2\)/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Filter links'), 'bandcamp');
    expect(screen.queryByText('Wikipedia')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Insert link Ceschi on Bandcamp' }));
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ label: 'Ceschi on Bandcamp' }));
  });

  it('disables the insert button when disabled prop is true', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Insert link Wikipedia' })).toBeDisabled();
  });

  it('renders a preview eye trigger for an external link', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Preview link Wikipedia' })).toBeInTheDocument();
  });

  it('renders no preview eye trigger for an internal link', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Preview link Sad, Fat Luck' })
    ).not.toBeInTheDocument();
  });

  it('previews external links inside a hover card on desktop', () => {
    mockIsMobile.mockReturnValue(false);
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('mock-hover-card')).toBeInTheDocument();
  });

  it('does not use a popover on desktop', () => {
    mockIsMobile.mockReturnValue(false);
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByTestId('mock-popover')).not.toBeInTheDocument();
  });

  it('previews external links inside a popover on mobile', () => {
    mockIsMobile.mockReturnValue(true);
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('mock-popover')).toBeInTheDocument();
  });

  it('does not use a hover card on mobile', () => {
    mockIsMobile.mockReturnValue(true);
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByTestId('mock-hover-card')).not.toBeInTheDocument();
  });

  it('passes the external link url to the preview card', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('link-preview-card')).toHaveAttribute(
      'data-url',
      'https://en.wikipedia.org/wiki/X'
    );
  });

  it('keeps the preview query idle until the card is opened', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByTestId('link-preview-card')).toHaveAttribute('data-enabled', 'false');
  });

  it('disables the preview eye trigger when disabled prop is true', () => {
    render(<BioLinkPalette links={LINKS} onDelete={vi.fn()} onInsert={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Preview link Wikipedia' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — the palette renders no Eye trigger yet.

```bash
pnpm exec vitest run src/app/components/forms/bio-link-palette.spec.tsx
```

Expected failure: `Unable to find an accessible element with the role "button" and name "Preview link Wikipedia"` (and the mock-hover-card / link-preview-card testids are absent).

- [ ] **Step 3: Implement** — add a self-contained per-row `LinkPreviewTrigger` (its own `open` state) and wire it into each external row's action cluster. Preserve the existing Insert/Delete handlers and the drag payload verbatim. Full file:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX } from 'react';

import { ExternalLink, Eye, Plus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/app/components/ui/hover-card';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';
import { BIO_LINK_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusLink } from '@/lib/validation/bio-generation-schema';

import { LinkPreviewCard } from './link-preview-card';

interface BioLinkPaletteProps {
  links: BioStatusLink[];
  onDelete: (linkId: string) => void;
  onInsert: (link: BioStatusLink) => void;
  disabled?: boolean;
}

interface LinkPreviewTriggerProps {
  url: string;
  label: string;
  disabled: boolean;
  isMobile: boolean;
}

/** Eye button that opens an unfurl preview for one external link. Holds its own
 *  open state so the `LinkPreviewCard` query stays idle until this row's card is
 *  opened. Desktop uses a hover card (hover/focus); mobile uses a popover (tap). */
const LinkPreviewTrigger = ({
  url,
  label,
  disabled,
  isMobile,
}: LinkPreviewTriggerProps): JSX.Element => {
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Preview link ${label}`}
      className="hover:text-primary shrink-0 p-0.5"
    >
      <Eye className="size-3.5" aria-hidden />
    </button>
  );

  const card = <LinkPreviewCard url={url} enabled={open} />;

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          {card}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align="end" className="w-72">
        {card}
      </HoverCardContent>
    </HoverCard>
  );
};

/** Curated, draggable list of discovered links. Tiles drag into the bio
 *  editors as `application/x-bio-link` payloads; the Plus button inserts
 *  at the focused editor's cursor (touch/keyboard path); X deletes the row.
 *  External links also carry an Eye button that opens an unfurl preview. */
export const BioLinkPalette = ({
  links,
  onDelete,
  onInsert,
  disabled = false,
}: BioLinkPaletteProps): JSX.Element => {
  const [filter, setFilter] = useState('');
  const isMobile = useIsMobile();

  const lower = filter.toLowerCase();
  const visible = lower
    ? links.filter(
        (link) =>
          link.label.toLowerCase().includes(lower) ||
          (link.kind ?? '').toLowerCase().includes(lower)
      )
    : links;

  return (
    <div role="group" aria-label="Discovered links" className="space-y-2">
      <h3 className="text-sm font-semibold">Discovered links ({links.length})</h3>
      <Input
        aria-label="Filter links"
        placeholder="Filter…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="h-7 text-xs"
      />
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {visible.map((link) => {
          const isExternal = !isInternalBioUrl(link.url);
          const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
            event.dataTransfer.setData(
              BIO_LINK_DRAG_MIME,
              JSON.stringify({
                label: link.label,
                url: link.url,
                kind: link.kind ?? null,
                isExternal,
              })
            );
            event.dataTransfer.effectAllowed = 'copy';
          };
          return (
            <li
              key={link.id}
              draggable
              onDragStart={onDragStart}
              className="border-border bg-background flex cursor-grab items-center gap-2 border px-2 py-1.5 text-sm active:cursor-grabbing"
            >
              {isExternal && (
                <ExternalLink
                  data-external-icon
                  className="text-muted-foreground size-3.5 shrink-0"
                  aria-hidden
                />
              )}
              <span className="truncate">{link.label}</span>
              {link.kind && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {link.kind}
                </Badge>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {isExternal && (
                  <LinkPreviewTrigger
                    url={link.url}
                    label={link.label}
                    disabled={disabled}
                    isMobile={isMobile}
                  />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInsert(link)}
                  aria-label={`Insert link ${link.label}`}
                  className="hover:text-primary p-0.5"
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDelete(link.id)}
                  aria-label={`Delete link ${link.label}`}
                  className="hover:text-destructive p-0.5"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
```

- [ ] **Step 4: Run it, expect PASS**

```bash
pnpm exec vitest run src/app/components/forms/bio-link-palette.spec.tsx
```

- [ ] **Step 5: Commit** — then run the full web gate before ending the cluster. This includes `test:coverage:check` — the spec's Gates require branch coverage ≥95% with no regression vs `COVERAGE_METRICS.md`, and no earlier step runs it.

```bash
git add src/app/components/forms/bio-link-palette.tsx src/app/components/forms/bio-link-palette.spec.tsx
git commit -m "feat(bio): ✨ link-preview trigger in palette"
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format && pnpm run test:coverage:check
```

### Task 9: E2E — admin bio link OG-unfurl preview (network-free)

**Files:**

- Create: `e2e/tests/admin-bio-link-preview.spec.ts`
- Modify: _(none)_
- Test: `e2e/tests/admin-bio-link-preview.spec.ts` _(the spec IS the deliverable — E2E is a leaf task)_

**Interfaces:**

- Consumes:
  - `test`, `expect` from `../fixtures/auth.fixture` (provides the `adminPage` admin-session fixture and the raw `browser` fixture).
  - `BIO_PALETTE_ARTIST_ID` from `../helpers/seed-test-db` — the dedicated seeded artist (`bioStatus: 'succeeded'`) that renders the Discovered-links palette on load with exactly one **external** `ArtistBioLink`: label `E2E Wikipedia`, url `https://en.wikipedia.org/wiki/Music`.
  - `GET /api/link-preview?url=<encoded>` — the route `export const GET = withRateLimit(linkPreviewLimiter, LINK_PREVIEW_LIMIT)(withAdmin(handler))`. Contract used here: literal-IP host → `403`; unauthenticated caller → `401` (via `withAdmin`, before any handler/network work).
  - `BioLinkPalette` Eye trigger — a `lucide-react` `Eye` `<button>` added before the Insert button on each external row. **This task pins its accessible name to `Preview link ${link.label}`** (mirroring the sibling `Insert link ${label}` / `Delete link ${label}` labels already in `bio-link-palette.tsx`); the palette-modification task MUST expose exactly that `aria-label` so this spec's selector resolves.
  - `LinkPreviewCard` fallback body — when `resolved: false` it renders `No preview available — ${new URL(url).host}` (the deterministic E2E_MODE branch).
- Produces: nothing consumed by later tasks (E2E leaf).

Determinism / isolation notes (must hold, do not weaken):

- The Playwright web server runs with `E2E_MODE=true` (`playwright.config.ts` `webServer.env`), so `getLinkPreview` short-circuits to a network-free `{ kind:'ok', preview:{ resolved:false, siteName:host, rest null } }` — **no DNS, no fetch, no sharp**. The card therefore always shows its graceful fallback, which is exactly what the acceptance criterion allows ("fallback content is fine").
- The default project viewport is `devices['Desktop Chrome']` → `useIsMobile()` is `false` → the palette uses shadcn **HoverCard** (opens on hover), so the UI test hovers the trigger.
- The literal-IP `403` path and the unauth `401/403` path are rejected **before** any DNS/fetch, so both API tests are fully deterministic and network-free regardless of E2E_MODE.
- All three tests are read-only (no DB writes, no mutation of the shared seeded rows) → **parallel-safe**. No new database URL is introduced; the harness owns the `localhost:27018` isolation via `E2E_DATABASE_URL`.

- [ ] **Step 1: Write the failing test** — the complete spec (all three behaviours: Eye opens a card, private literal-IP → 403, unauth → 401/403).

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { BIO_PALETTE_ARTIST_ID } from '../helpers/seed-test-db';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin bio-editor link OG-unfurl preview (PR 3).
 *
 * The web server runs with E2E_MODE=true (see playwright.config.ts), so
 * `getLinkPreview` short-circuits to a deterministic, network-free
 * `resolved:false` response — no DNS, fetch, or sharp ever runs. The preview
 * card therefore always renders its graceful fallback
 * ("No preview available — <host>"), which is what the UI test asserts: the Eye
 * trigger opens a card.
 *
 * The endpoint's SSRF + auth guards are checked with direct API requests: a
 * literal-IP host is rejected 403 before any network work, and an
 * unauthenticated caller is rejected by `withAdmin` (401/403). Both are
 * pre-handler rejections, so they never reach the live internet.
 */

// The dedicated seeded palette artist (bioStatus 'succeeded') renders the
// Discovered-links palette on load, carrying one EXTERNAL link:
// "E2E Wikipedia" -> https://en.wikipedia.org/wiki/Music.
const EXTERNAL_LINK_LABEL = 'E2E Wikipedia';
const EXTERNAL_LINK_HOST = 'en.wikipedia.org';

const gotoPaletteArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_PALETTE_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

test.describe('Admin bio link OG-unfurl preview', () => {
  test('Eye trigger on an external link opens a preview card', async ({ adminPage }) => {
    await gotoPaletteArtistEdit(adminPage);

    // Guard against transient hydration doubles before interacting.
    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup).toBeVisible();

    // The Eye trigger's accessible name mirrors the row's sibling actions
    // ("Insert link ..." / "Delete link ...") in BioLinkPalette.
    const eyeTrigger = adminPage.getByRole('button', {
      name: `Preview link ${EXTERNAL_LINK_LABEL}`,
    });
    await expect(eyeTrigger).toBeVisible();

    // Desktop viewport -> useIsMobile() false -> shadcn HoverCard, which opens on
    // hover. Under E2E_MODE the query resolves network-free to a fallback card.
    await eyeTrigger.hover();

    const fallback = adminPage.getByText(/No preview available/i);
    await expect(fallback).toBeVisible({ timeout: 15_000 });
    await expect(fallback).toContainText(EXTERNAL_LINK_HOST);
  });

  test('endpoint rejects a private literal-IP host with 403', async ({ adminPage }) => {
    // 169.254.169.254 (link-local cloud-metadata address) is a literal IP, so the
    // route rejects it (isIP(hostname) !== 0 -> 403) BEFORE any DNS/fetch — fully
    // deterministic and network-free. adminPage.request carries the admin session,
    // so the request clears withAdmin and reaches the handler's SSRF guard.
    const response = await adminPage.request.get(
      `/api/link-preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`
    );
    expect(response.status()).toBe(403);
  });

  test('endpoint rejects a bracketed literal IPv6 host with 403', async ({ adminPage }) => {
    // `http://[::1]/` → URL hostname `[::1]`; the route strips the brackets before
    // isIP(), so this loopback literal is rejected 403 before any DNS/fetch —
    // deterministic and network-free.
    const response = await adminPage.request.get(
      `/api/link-preview?url=${encodeURIComponent('http://[::1]/')}`
    );
    expect(response.status()).toBe(403);
  });

  test('endpoint is admin-gated (unauthenticated -> 401/403)', async ({ browser }) => {
    // A fresh context with no storageState is unauthenticated; it still inherits
    // the project baseURL (like the auth-fixture contexts), so the relative URL
    // resolves. withAdmin rejects before the handler runs — no network work.
    const context = await browser.newContext();
    try {
      const response = await context.request.get(
        `/api/link-preview?url=${encodeURIComponent('https://example.com/')}`
      );
      expect([401, 403]).toContain(response.status());
    } finally {
      await context.close();
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — bring up the isolated E2E Mongo, then run only this spec.

```bash
pnpm run e2e:docker:up
pnpm run test:e2e e2e/tests/admin-bio-link-preview.spec.ts
```

Expected failure when run against a checkout where the feature stack (route + palette Eye) is not yet wired:

- UI test: `TimeoutError: locator.hover: ... getByRole('button', { name: 'Preview link E2E Wikipedia' })` never becomes visible (no Eye trigger rendered), or `expect(getByText(/No preview available/i)).toBeVisible()` times out.
- `403` tests (IPv4 cloud-metadata + bracketed IPv6): `expect(received).toBe(expected) // Expected: 403 Received: 404` (route `/api/link-preview` does not exist yet).
- admin-gating test: `expect([401, 403]).toContain(404)` fails (route missing).

- [ ] **Step 3: Implement** — Task 9 introduces **no new production source**. The behaviour under test is delivered by the earlier tasks in this plan: the `GET /api/link-preview` route (`withRateLimit(...)(withAdmin(...))` with `isInternalBioUrl` / literal-IP `403` guards), the E2E_MODE short-circuit in `link-preview-service.ts`, `useLinkPreviewQuery` + `LinkPreviewCard`, and the `Eye` trigger added to `bio-link-palette.tsx` (accessible name `Preview link ${link.label}`). No new seed data is required either — the seeded `BIO_PALETTE_ARTIST_ID` artist already carries the external `E2E Wikipedia` link and renders the palette on load. The sole artifact this task ships is the spec authored in Step 1; greening it is a matter of running it against the completed stack (Step 4). If Step 2 surfaced a genuine gap in an owning task (e.g. the Eye trigger's `aria-label` differs from `Preview link ${label}`), fix it in that task so this contract holds, then re-run.

- [ ] **Step 4: Run it, expect PASS** — the same command; all three tests are green against the completed feature stack.

```bash
pnpm run test:e2e e2e/tests/admin-bio-link-preview.spec.ts
```

- [ ] **Step 5: Commit** —

```bash
git add e2e/tests/admin-bio-link-preview.spec.ts
git commit -m "test(bio): ✅ e2e link-preview eye + guards"
```
