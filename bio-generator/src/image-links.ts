/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioCallback } from './callback.js';
import { readUrl } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getScrapeApiKey } from './lib/secrets.js';
import { annotateFaces, fetchReferenceBytes } from './rekognition.js';
import { toScrapedBioImage } from './scraped-image.js';
import { callbackTargetSchema, IMAGE_LINKS_TASK, imageLinksInputSchema } from './types.js';
import { fetchCandidates } from './vision.js';

import type { ScrapedImage } from './jina.js';
import type { FaceAnnotation } from './rekognition.js';
import type { BioImage, ImageLinksData, ImageLinksInput, ImageLinksResult } from './types.js';
import type { FetchedCandidate } from './vision.js';

/** Injectable collaborators so the orchestration can be unit-tested in full. */
export interface ImageLinksDeps {
  /** Jina reader: page content plus the plausible photos scraped from it. */
  readUrl: typeof readUrl;
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
  readUrl,
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

/**
 * The scraped candidates one link contributes: the link itself when it is a
 * direct image, else whatever the reader scraped from the page (already
 * filtered to plausible photos). A null read contributes nothing.
 */
const candidatesForLink = async (
  link: string,
  { scrapeKey, deps, fetchFn }: LinkReadContext
): Promise<ScrapedImage[]> => {
  if (await probeDirectImage(link, fetchFn)) return [{ url: link, alt: null, sourceUrl: link }];
  const result = await deps.readUrl(link, scrapeKey);
  return result?.images ?? [];
};

/**
 * Reads every link sequentially (never recursively), deduping by URL across
 * links and stopping — without reading further links — once the cap is hit.
 */
const collectCandidates = async (
  links: readonly string[],
  context: LinkReadContext
): Promise<BioImage[]> => {
  const seen = new Set<string>();
  const candidates: BioImage[] = [];
  for (const link of links) {
    if (candidates.length >= MAX_LINK_IMAGES) break;
    for (const scraped of await candidatesForLink(link, context)) {
      const key = scraped.url.toLowerCase();
      if (seen.has(key) || candidates.length >= MAX_LINK_IMAGES) continue;
      seen.add(key);
      candidates.push({ ...toScrapedBioImage(scraped), kind: 'photo', isPrimary: false });
    }
  }
  return candidates;
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
 * links given.
 */
export const runImageLinks = async (
  input: ImageLinksInput,
  deps: ImageLinksDeps = defaultDeps
): Promise<ImageLinksData> => {
  const fetchFn = deps.fetchFn ?? fetch;
  // Jina works keyless (lower rate limit); the key only raises the limit.
  const scrapeKey = await deps.getScrapeApiKey();
  logEvent('info', 'image_links_start', {
    artistId: input.artistId,
    links: input.links.length,
    jinaKey: Boolean(scrapeKey),
  });
  const candidates = await collectCandidates(input.links, { scrapeKey, deps, fetchFn });
  const images = await annotateCandidates(candidates, input, deps, fetchFn);
  logEvent('info', 'image_links_done', { artistId: input.artistId, images: images.length });
  return { images };
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
    result = { ok: true, data: await runImageLinks(parsed.data, deps) };
  } catch (err) {
    logEvent('warn', 'image_links_failed', { error: toErrorMessage(err) });
    result = { ok: false, error: toErrorMessage(err) };
  }

  const { callbackUrl, jobToken } = parsed.data;
  await deps.postCallback({ url: callbackUrl, jobToken, result });
  return result;
};
