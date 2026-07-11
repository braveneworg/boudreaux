/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';
import { buildPinnedDispatcher, vetHostname } from '@/lib/utils/ssrf-fetch';

import type { Agent } from 'undici';

/** Per-probe budget — a link that cannot answer in time is kept, never dropped. */
export const VALIDATE_LINK_TIMEOUT_MS = 5_000;

/** Redirect hops followed after the initial response before giving up (KEEP). */
export const MAX_REDIRECT_HOPS = 2;

/** Maximum number of links probed in flight at once. */
export const VALIDATE_LINK_CONCURRENCY = 6;

type DropReason = 'dns_failure' | 'ssrf_disallowed' | 'gone';

type LinkVerdict = { kind: 'keep' } | { kind: 'drop'; reason: DropReason };

interface DroppedLink {
  url: string;
  reason: DropReason;
}

const KEEP: LinkVerdict = { kind: 'keep' };

// Mirrors link-preview-service: in E2E the validator never touches the network.
const isE2eMode = (): boolean => process.env.E2E_MODE === 'true';

// Parse a URL (optionally against a redirect base), accepting only absolute
// http(s). Anything else — relative without a base, mailto:, garbage — returns
// null and the caller keeps the link without probing it.
const parseHttpUrl = (value: string, base?: URL): URL | null => {
  try {
    const parsed = new URL(value, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
};

// One probe against an already-vetted dispatcher: HEAD with manual redirects,
// falling back to GET when the server rejects HEAD (405/501). The GET body is
// cancelled best-effort, never buffered — the verdict only needs status/headers.
const probeRequest = async (url: string, dispatcher: Agent): Promise<Response> => {
  const headInit = {
    method: 'HEAD' as const,
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(VALIDATE_LINK_TIMEOUT_MS),
    dispatcher,
  };
  const headResponse = await fetch(url, headInit);
  if (headResponse.status !== 405 && headResponse.status !== 501) return headResponse;
  const getInit = {
    method: 'GET' as const,
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(VALIDATE_LINK_TIMEOUT_MS),
    dispatcher,
  };
  const getResponse = await fetch(url, getInit);
  await getResponse.body?.cancel().catch(() => undefined);
  return getResponse;
};

type HopOutcome =
  | { kind: 'response'; response: Response }
  | { kind: 'drop'; reason: DropReason }
  | { kind: 'inconclusive' };

// Vet one hop's hostname (DNS + SSRF blocklist) and probe it through a fresh
// dispatcher pinned to the vetted address. Only vet failures are definitive;
// any network error after a passing vet is an availability blip → inconclusive
// (the caller keeps the link). The dispatcher is closed best-effort.
const probeHop = async (url: URL): Promise<HopOutcome> => {
  const vetted = await vetHostname(url.hostname);
  if (!vetted.ok) {
    return {
      kind: 'drop',
      reason: vetted.reason === 'dns_failure' ? 'dns_failure' : 'ssrf_disallowed',
    };
  }
  const dispatcher = buildPinnedDispatcher(vetted.address, vetted.family);
  try {
    return { kind: 'response', response: await probeRequest(url.toString(), dispatcher) };
  } catch {
    return { kind: 'inconclusive' };
  } finally {
    try {
      await dispatcher.close();
    } catch {
      // Best-effort cleanup — a close failure must not affect the verdict.
    }
  }
};

type ResponseOutcome =
  | { kind: 'verdict'; verdict: LinkVerdict }
  | { kind: 'redirect'; nextUrl: URL };

// Map one hop's response to a verdict, or surface the next redirect target.
// Only definitive tombstones (404/410) drop; a 3xx without a usable http(s)
// location — and every other status — keeps.
const classifyResponse = (response: Response, currentUrl: URL): ResponseOutcome => {
  if (response.status === 404 || response.status === 410) {
    return { kind: 'verdict', verdict: { kind: 'drop', reason: 'gone' } };
  }
  if (response.status < 300 || response.status >= 400) {
    return { kind: 'verdict', verdict: KEEP };
  }
  const location = response.headers.get('location');
  const nextUrl = location ? parseHttpUrl(location, currentUrl) : null;
  if (!nextUrl) return { kind: 'verdict', verdict: KEEP };
  return { kind: 'redirect', nextUrl };
};

// Follow one link through at most MAX_REDIRECT_HOPS redirects, re-parsing and
// re-vetting every hop. Exhausting the hop budget is inconclusive → keep.
const classifyLink = async (rawUrl: string): Promise<LinkVerdict> => {
  let currentUrl = parseHttpUrl(rawUrl);
  if (!currentUrl) return KEEP;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const outcome = await probeHop(currentUrl);
    if (outcome.kind === 'drop') return { kind: 'drop', reason: outcome.reason };
    if (outcome.kind === 'inconclusive') return KEEP;
    const next = classifyResponse(outcome.response, currentUrl);
    if (next.kind === 'verdict') return next.verdict;
    currentUrl = next.nextUrl;
  }
  return KEEP;
};

// Safety net: an unexpected internal error must never throw out of the
// validator or purge a link — the link is kept as inconclusive.
const classifyLinkSafe = async (rawUrl: string): Promise<LinkVerdict> => {
  try {
    return await classifyLink(rawUrl);
  } catch {
    return KEEP;
  }
};

// Minimal cursor worker pool: `limit` workers each claim the next unclaimed
// entry from a shared iterator until the list is exhausted. The single-threaded
// event loop makes each synchronous `next()` claim race-free, and `run` never
// rejects (classifyLinkSafe never throws). Results are keyed by input index.
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<Map<number, R>> => {
  const results = new Map<number, R>();
  const entries = items.entries();
  const worker = async (): Promise<void> => {
    for (let next = entries.next(); !next.done; next = entries.next()) {
      const [index, item] = next.value;
      results.set(index, await run(item));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
};

// One summary line per validation pass; warn (not info) when anything was
// dropped so link purges stand out in the media log stream.
const logSummary = ({
  total,
  kept,
  drops,
}: {
  total: number;
  kept: number;
  drops: DroppedLink[];
}): void => {
  const payload = { total, kept, dropped: drops.length, drops };
  if (drops.length > 0) {
    loggers.media.warn('bio_link_validation', payload);
    return;
  }
  loggers.media.info('bio_link_validation', payload);
};

/**
 * Probes each external bio link over the network and drops ONLY the
 * definitively dead: DNS failure, SSRF-disallowed resolution, or an HTTP
 * 404/410 tombstone (from HEAD, its GET fallback, or the terminal response of
 * a bounded, per-hop re-vetted redirect chain). Everything inconclusive —
 * non-http(s) URLs, timeouts, 401/403/429, 5xx, socket errors, deep redirect
 * chains — is kept, so an availability blip can never purge good links.
 *
 * Never throws, never mutates `links`, preserves input order, and returns the
 * caller's own link objects. In E2E mode the input array is returned untouched
 * with zero network activity and zero logging.
 */
export const validateBioLinks = async <T extends { url: string }>(links: T[]): Promise<T[]> => {
  if (isE2eMode()) return links;
  const verdicts = await mapWithConcurrency(links, VALIDATE_LINK_CONCURRENCY, ({ url }) =>
    classifyLinkSafe(url)
  );
  const drops = links.flatMap(({ url }, index): DroppedLink[] => {
    const verdict = verdicts.get(index);
    return verdict?.kind === 'drop' ? [{ url, reason: verdict.reason }] : [];
  });
  const kept = links.filter((_, index) => verdicts.get(index)?.kind !== 'drop');
  logSummary({ total: links.length, kept: kept.length, drops });
  return kept;
};
