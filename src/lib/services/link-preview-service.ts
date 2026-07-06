/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { LRUCache } from 'lru-cache';

import { extractOpenGraph } from '@/lib/utils/extract-open-graph';
import type { OpenGraphTags } from '@/lib/utils/extract-open-graph';
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

// Builds the pinned dispatcher for the page fetch, then closes it best-effort.
// Any fetch/parse failure degrades to null so the caller renders the host-only
// fallback; a close failure never affects the result.
const fetchPageHtml = async (
  url: string,
  address: string,
  family: number
): Promise<string | null> => {
  const dispatcher = buildPinnedDispatcher(address, family);
  try {
    return await fetchHtml(url, dispatcher);
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

// Parse a hero/favicon URL, accepting only http(s). Returns null for an
// unparseable URL or a non-http(s) protocol (e.g. `data:`/`javascript:`).
const parseHttpUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
};

// DNS-pinned, redirect-manual, timed-out, byte-capped image fetch. Returns the
// raw bytes, or null for any redirect/non-2xx/non-image/over-cap response.
const fetchImageBuffer = async (imageUrl: string, dispatcher: Agent): Promise<Buffer | null> => {
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
  return streamToBuffer(response.body, IMAGE_BYTE_CAP, 'reject');
};

// Best-effort: SSRF-vet + DNS-pinned fetch a hero/favicon and re-encode it as a
// bounded webp data URI. Any failure (parse, protocol, vet, fetch, non-image,
// sharp) resolves to null so the card degrades to text-only.
const fetchImageDataUri = async (imageUrl: string, width: number): Promise<string | null> => {
  const parsed = parseHttpUrl(imageUrl);
  if (!parsed) return null;
  const vetted = await vetHostname(parsed.hostname);
  if (!vetted.ok) return null;
  const dispatcher = buildPinnedDispatcher(vetted.address, vetted.family);
  try {
    const buffer = await fetchImageBuffer(imageUrl, dispatcher);
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

// True when the page yielded at least one renderable signal (title, description,
// or hero image); otherwise the card degrades to the host-only fallback.
const hasRenderableTags = (tags: OpenGraphTags): boolean =>
  Boolean(tags.title || tags.description || tags.imageUrl);

// Assemble a resolved:true preview: best-effort thumbnail the hero + favicon in
// parallel and sanitize every text field (siteName falls back to the host).
const buildResolvedPreview = async (
  url: string,
  hostname: string,
  tags: OpenGraphTags
): Promise<LinkPreview> => {
  const [imageDataUri, faviconDataUri] = await Promise.all([
    tags.imageUrl ? fetchImageDataUri(tags.imageUrl, HERO_WIDTH) : Promise.resolve(null),
    tags.faviconUrl ? fetchImageDataUri(tags.faviconUrl, FAVICON_WIDTH) : Promise.resolve(null),
  ]);
  return {
    url,
    resolved: true,
    title: tags.title ? sanitizeBioText(tags.title) : null,
    description: tags.description ? sanitizeBioText(tags.description) : null,
    siteName: tags.siteName ? sanitizeBioText(tags.siteName) : hostname,
    imageDataUri,
    faviconDataUri,
  };
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

  // Cache the preview (successes AND resolved:false negatives) before returning.
  const cacheAndReturn = (preview: LinkPreview): LinkPreviewOutcome => {
    previewCache.set(normalizedUrl, preview);
    return { kind: 'ok', preview };
  };

  const vetted = await vetHostname(hostname);
  if (!vetted.ok && vetted.reason === 'disallowed') return { kind: 'forbidden' };
  if (!vetted.ok) return cacheAndReturn(buildFallbackPreview(normalizedUrl, hostname));

  const html = await fetchPageHtml(normalizedUrl, vetted.address, vetted.family);
  const tags = html ? extractOpenGraph(html, normalizedUrl) : null;
  if (!tags || !hasRenderableTags(tags)) {
    return cacheAndReturn(buildFallbackPreview(normalizedUrl, hostname));
  }

  return cacheAndReturn(await buildResolvedPreview(normalizedUrl, hostname, tags));
};
