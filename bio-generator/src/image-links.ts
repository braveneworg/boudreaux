/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioCallback } from './callback.js';
import { readUrlOutcome } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getScrapeApiKey } from './lib/secrets.js';
import { annotateFaces, fetchReferenceBytes } from './rekognition.js';
import { attributionHost, toScrapedBioImage } from './scraped-image.js';
import { callbackTargetSchema, IMAGE_LINKS_TASK, imageLinksInputSchema } from './types.js';
import { fetchCandidates } from './vision.js';

import type { ScrapedImage } from './jina.js';
import type { FaceAnnotation } from './rekognition.js';
import type { BioImage, ImageLinksInput, ImageLinksResult } from './types.js';
import type { FetchedCandidate } from './vision.js';

/** Injectable collaborators so the orchestration can be unit-tested in full. */
export interface ImageLinksDeps {
  /**
   * Jina reader, outcome-shaped: the page's plausible photos, or why there is
   * no page (a bot wall vs. an unreadable link) — the admin is told which.
   */
  readPage: typeof readUrlOutcome;
  getScrapeApiKey: typeof getScrapeApiKey;
  /** Fetches admin reference image bytes for the CompareFaces stage. */
  fetchReferenceBytes: typeof fetchReferenceBytes;
  /** Annotates the fetched candidates with the Rekognition face signal. */
  annotateFaces: typeof annotateFaces;
  /** Best-effort POST of the result back to the web app's async callback. */
  postCallback: typeof postBioCallback;
  /** Fetch used for the link probes and the candidate byte fetch (defaults to global). */
  fetchFn?: typeof fetch;
}

const defaultDeps: ImageLinksDeps = {
  readPage: readUrlOutcome,
  getScrapeApiKey,
  fetchReferenceBytes,
  annotateFaces,
  postCallback: postBioCallback,
};

/** Cap on candidates one job ships — mirrors the bio path's image cap. */
export const MAX_LINK_IMAGES = 100;
/** Per-probe budget: a link that cannot answer a HEAD/GET in time is read as a page. */
export const LINK_PROBE_TIMEOUT_MS = 8_000;

/** True when an unknown event is a `task: 'images-from-links'` invoke. */
export const isImageLinksTask = (event: unknown): boolean =>
  typeof event === 'object' && event !== null && 'task' in event && event.task === IMAGE_LINKS_TASK;

/** True when the response declares an image body. */
const isImageResponse = (response: Response): boolean =>
  (response.headers.get('content-type') ?? '').trim().toLowerCase().startsWith('image/');

/** Discards a probe body we never intend to read, so the connection is released. */
const discardBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    // The stream may already be locked or closed — nothing to release.
  }
};

/**
 * Whether the link points straight at an image. HEAD first; when the host
 * refuses or errors on HEAD (405 is common on CDNs) fall back to a GET asking
 * for `image/*`, whose body is discarded unread. Any failure means "not a
 * direct image", so the link is read as a page instead — never fatal.
 */
const probeDirectImage = async (url: string, fetchFn: typeof fetch): Promise<boolean> => {
  try {
    const head = await fetchFn(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(LINK_PROBE_TIMEOUT_MS),
    });
    if (head.ok) return isImageResponse(head);
  } catch {
    // Fall through to the GET probe.
  }
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(LINK_PROBE_TIMEOUT_MS),
    });
    await discardBody(response);
    return response.ok && isImageResponse(response);
  } catch {
    return false;
  }
};

/** Grouped collaborators for the per-link read (object arg: `max-params`). */
interface LinkReadContext {
  scrapeKey: string | null;
  deps: ImageLinksDeps;
  fetchFn: typeof fetch;
}

/** What one link contributed: its photos, or the reason it contributed none. */
type LinkOutcome =
  { kind: 'read'; images: ScrapedImage[] } | { kind: 'blocked' } | { kind: 'unreadable' };

/**
 * The scraped candidates one link contributes: the link itself when it is a
 * direct image, else whatever the reader scraped from the page (already
 * filtered to plausible photos) — or why the page gave nothing.
 */
const candidatesForLink = async (
  link: string,
  { scrapeKey, deps, fetchFn }: LinkReadContext
): Promise<LinkOutcome> => {
  if (await probeDirectImage(link, fetchFn)) {
    return { kind: 'read', images: [{ url: link, alt: null, sourceUrl: link }] };
  }
  const outcome = await deps.readPage(link, scrapeKey);
  return outcome.kind === 'read' ? { kind: 'read', images: outcome.result.images } : outcome;
};

/** Hosts (deduped, `www.` stripped) of the links that yielded no page, by reason. */
interface SkippedHosts {
  blocked: string[];
  unreadable: string[];
}

/** The candidates gathered across every link, plus the links that gave nothing. */
interface CollectedCandidates {
  candidates: BioImage[];
  skipped: SkippedHosts;
}

/** Adds the link's host to the list once, in first-seen order. */
const noteHost = (hosts: string[], link: string): void => {
  const host = attributionHost(link);
  if (!hosts.includes(host)) hosts.push(host);
};

/**
 * Reads every link sequentially (never recursively), deduping by URL across
 * links and stopping — without reading further links — once the cap is hit.
 * Links that produced no page are recorded by host and reason.
 */
const collectCandidates = async (
  links: readonly string[],
  context: LinkReadContext
): Promise<CollectedCandidates> => {
  const seen = new Set<string>();
  const candidates: BioImage[] = [];
  const skipped: SkippedHosts = { blocked: [], unreadable: [] };
  for (const link of links) {
    if (candidates.length >= MAX_LINK_IMAGES) break;
    const outcome = await candidatesForLink(link, context);
    if (outcome.kind !== 'read') {
      noteHost(skipped[outcome.kind], link);
      continue;
    }
    for (const scraped of outcome.images) {
      const key = scraped.url.toLowerCase();
      if (seen.has(key) || candidates.length >= MAX_LINK_IMAGES) continue;
      seen.add(key);
      candidates.push({ ...toScrapedBioImage(scraped), kind: 'photo', isPrimary: false });
    }
  }
  return { candidates, skipped };
};

/** True when at least one link produced no page. */
const anySkipped = ({ blocked, unreadable }: SkippedHosts): boolean =>
  blocked.length > 0 || unreadable.length > 0;

/**
 * The admin-facing reason nothing was pulled, naming each host once. A bot
 * wall and a dead link call for different fixes (open it in a browser and
 * save the photos vs. check the URL), so the two are spelled out separately.
 */
export const noImagesMessage = ({ blocked, unreadable }: SkippedHosts): string => {
  const reasons = [
    blocked.length ? `${blocked.join(', ')} blocked automated access (bot check)` : null,
    unreadable.length ? `${unreadable.join(', ')} could not be read` : null,
  ].filter((reason): reason is string => reason !== null);
  return `No images could be pulled: ${reasons.join('; ')}.`;
};

/**
 * The Rekognition annotations for the fetched candidates, one per entry in
 * input order. Reference fetch and annotation failures both degrade to an
 * empty list (→ null signals downstream): the face signal is a ranking hint,
 * never a reason to lose the images.
 */
const safeAnnotations = async (
  fetched: FetchedCandidate[],
  referenceUrls: readonly string[],
  deps: ImageLinksDeps
): Promise<FaceAnnotation[]> => {
  try {
    const refs = referenceUrls.length ? await deps.fetchReferenceBytes([...referenceUrls]) : [];
    return await deps.annotateFaces(fetched, refs);
  } catch (err) {
    logEvent('warn', 'image_links_face_annotation_failed', { error: toErrorMessage(err) });
    return [];
  }
};

/**
 * Fetches each candidate's bytes (dropping the unfetchable — they could never
 * be rehosted) and attaches the face signal. No Gemini vision gate: the admin
 * chose these links deliberately, so provenance is already asserted.
 */
const annotateCandidates = async (
  candidates: BioImage[],
  input: ImageLinksInput,
  deps: ImageLinksDeps,
  fetchFn: typeof fetch
): Promise<BioImage[]> => {
  const fetched = await fetchCandidates(candidates, fetchFn);
  logEvent('info', 'image_links_fetched', {
    candidates: candidates.length,
    fetched: fetched.length,
  });
  if (!fetched.length) return [];
  const annotations = await safeAnnotations(fetched, input.referenceImageUrls ?? [], deps);
  return fetched.map((entry, index) => ({
    ...entry.image,
    hasFace: annotations.at(index)?.hasFace ?? null,
    faceScore: annotations.at(index)?.faceScore ?? null,
  }));
};

/**
 * Orchestrates one images-from-links run: probe/read each admin-supplied link
 * for photos, dedupe and cap, then fetch bytes and face-score them against the
 * artist's reference images. Sequential and bounded — no crawl beyond the
 * links given. When nothing was pulled *because* links were blocked or
 * unreadable, the run fails with a message naming those hosts; a readable page
 * that simply has no photos still succeeds with an empty list.
 */
export const runImageLinks = async (
  input: ImageLinksInput,
  deps: ImageLinksDeps = defaultDeps
): Promise<ImageLinksResult> => {
  const fetchFn = deps.fetchFn ?? fetch;
  // Jina works keyless (lower rate limit); the key only raises the limit.
  const scrapeKey = await deps.getScrapeApiKey();
  logEvent('info', 'image_links_start', {
    artistId: input.artistId,
    links: input.links.length,
    jinaKey: Boolean(scrapeKey),
  });
  const { candidates, skipped } = await collectCandidates(input.links, {
    scrapeKey,
    deps,
    fetchFn,
  });
  if (!candidates.length && anySkipped(skipped)) {
    logEvent('info', 'image_links_nothing_readable', { artistId: input.artistId, ...skipped });
    return { ok: false, error: noImagesMessage(skipped) };
  }
  if (anySkipped(skipped)) {
    logEvent('warn', 'image_links_links_skipped', { artistId: input.artistId, ...skipped });
  }
  const images = await annotateCandidates(candidates, input, deps, fetchFn);
  logEvent('info', 'image_links_done', { artistId: input.artistId, images: images.length });
  return { ok: true, data: { images } };
};

/**
 * The testable Lambda core for `task: 'images-from-links'`: validate, run,
 * convert a throw into the `ok: false` envelope, and POST the result to the
 * web app's callback (best-effort). A malformed event that still carries its
 * callback plumbing is reported the same way, so the web app fails the job at
 * once instead of waiting out the stale sweep.
 */
export const runImageLinksLambda = async (
  event: unknown,
  deps: ImageLinksDeps = defaultDeps
): Promise<ImageLinksResult> => {
  const parsed = imageLinksInputSchema.safeParse(event);
  if (!parsed.success) {
    const result: ImageLinksResult = {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
    };
    const target = callbackTargetSchema.safeParse(event);
    if (target.success) {
      await deps.postCallback({
        url: target.data.callbackUrl,
        jobToken: target.data.jobToken,
        result,
      });
    }
    return result;
  }

  let result: ImageLinksResult;
  try {
    result = await runImageLinks(parsed.data, deps);
  } catch (err) {
    logEvent('warn', 'image_links_failed', { error: toErrorMessage(err) });
    result = { ok: false, error: toErrorMessage(err) };
  }

  const { callbackUrl, jobToken } = parsed.data;
  await deps.postCallback({ url: callbackUrl, jobToken, result });
  return result;
};
