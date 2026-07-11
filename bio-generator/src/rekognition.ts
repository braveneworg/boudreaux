/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  CompareFacesCommand,
  DetectFacesCommand,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

import { logEvent, toErrorMessage } from './lib/log.js';
import { VISION_FETCH_MAX_BYTES } from './vision.js';

import type { VerifiedScrapedImage } from './vision.js';

/** Max admin reference images fed to CompareFaces (the first N of up to 5 supplied). */
const REFERENCE_LIMIT = 3;
/** Concurrent {@link annotateOne} calls — bounds Rekognition throughput and the Lambda budget. */
const ANNOTATE_CONCURRENCY = 4;
/** Reference-fetch timeout, mirroring the vision candidate fetch. */
const REFERENCE_FETCH_TIMEOUT_MS = 8_000;
/** CompareFaces returns every match at or above this similarity, so we take the max ourselves. */
const COMPARE_SIMILARITY_THRESHOLD = 0;

/**
 * The Rekognition face signal for one candidate. `hasFace`/`faceScore` are
 * `null` when the image was not analyzed (empty candidate set never reaches
 * here) or a per-candidate AWS error degraded it. This is a ranking signal only.
 */
export interface FaceAnnotation {
  hasFace: boolean | null;
  faceScore: number | null;
}

/**
 * Lazily-constructed, reused across warm invokes (cold-start reuse). Built with
 * an empty config so it resolves the Lambda's IAM role — no key, no SSM — and so
 * importing this module never requires AWS credentials at module-eval time.
 */
let defaultClient: RekognitionClient | null = null;
const getDefaultClient = (): RekognitionClient => {
  defaultClient ??= new RekognitionClient({});
  return defaultClient;
};

/** True when the Content-Length header declares a payload larger than the byte limit. */
const isOversizedByHeader = (headers: Headers): boolean => {
  const header = headers.get('content-length');
  if (header === null) return false;
  const declared = Number(header);
  return !Number.isNaN(declared) && declared > VISION_FETCH_MAX_BYTES;
};

/** Fetches one reference image's bytes; null (skip) on any failure — fail closed. */
const fetchReference = async (url: string, fetchFn: typeof fetch): Promise<Buffer | null> => {
  try {
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!mimeType.startsWith('image/')) return null;
    if (isOversizedByHeader(response.headers)) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > VISION_FETCH_MAX_BYTES) return null;
    return Buffer.from(bytes);
  } catch {
    return null;
  }
};

/**
 * Fetches up to {@link REFERENCE_LIMIT} admin reference images (the first three
 * of the supplied URLs), each fail-closed exactly like the vision candidate
 * fetch (timeout, `image/*` only, ≤ {@link VISION_FETCH_MAX_BYTES}). Failures are
 * skipped, never thrown, so 0..3 buffers return.
 *
 * @param urls - Admin-supplied reference image URLs (already URL-validated).
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns The successfully fetched reference buffers, in URL order.
 */
export const fetchReferenceBytes = async (
  urls: string[],
  fetchFn: typeof fetch = fetch
): Promise<Buffer[]> => {
  const fetched = await Promise.all(
    urls.slice(0, REFERENCE_LIMIT).map((url) => fetchReference(url, fetchFn))
  );
  return fetched.filter((buffer): buffer is Buffer => buffer !== null);
};

/** Runs CompareFaces for one candidate against every reference, taking the max similarity. */
const scoreAgainstReferences = async (
  client: RekognitionClient,
  candidateBytes: Buffer,
  referenceBytes: Buffer[]
): Promise<number> => {
  let best = 0;
  for (const reference of referenceBytes) {
    const response = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: reference },
        TargetImage: { Bytes: candidateBytes },
        SimilarityThreshold: COMPARE_SIMILARITY_THRESHOLD,
      })
    );
    for (const match of response.FaceMatches ?? []) {
      best = Math.max(best, match.Similarity ?? 0);
    }
  }
  return best;
};

/**
 * Annotates one candidate: DetectFaces decides `hasFace`; a detected face with
 * references scores `faceScore` via CompareFaces (null with no references). ANY
 * AWS error degrades this candidate to nulls, logged once — a sibling is never
 * affected and nothing throws.
 */
const annotateOne = async (
  client: RekognitionClient,
  candidate: VerifiedScrapedImage,
  referenceBytes: Buffer[]
): Promise<FaceAnnotation> => {
  const candidateBytes = Buffer.from(candidate.base64, 'base64');
  try {
    const detected = await client.send(
      new DetectFacesCommand({ Image: { Bytes: candidateBytes } })
    );
    const hasFace = (detected.FaceDetails ?? []).length > 0;
    if (!hasFace) return { hasFace: false, faceScore: null };
    if (!referenceBytes.length) return { hasFace: true, faceScore: null };
    const faceScore = await scoreAgainstReferences(client, candidateBytes, referenceBytes);
    return { hasFace: true, faceScore };
  } catch (err) {
    logEvent('warn', 'rekognition_failed', { error: toErrorMessage(err) });
    return { hasFace: null, faceScore: null };
  }
};

/**
 * Annotates each verified candidate with a Rekognition face signal, reusing the
 * bytes the vision gate already fetched (no refetch). Runs through a small
 * concurrency pool that preserves input order. Empty candidates make zero
 * Rekognition calls and return `[]`.
 *
 * @param candidates - Vision-verified survivors carrying their fetched bytes.
 * @param referenceBytes - Admin reference image bytes (0..3); empty skips CompareFaces.
 * @param client - Injectable Rekognition client (defaults to the lazy module client).
 * @returns One {@link FaceAnnotation} per candidate, in input order.
 */
export const annotateFaces = async (
  candidates: VerifiedScrapedImage[],
  referenceBytes: Buffer[],
  client: RekognitionClient = getDefaultClient()
): Promise<FaceAnnotation[]> => {
  if (!candidates.length) return [];

  const annotations: FaceAnnotation[] = [];
  for (let i = 0; i < candidates.length; i += ANNOTATE_CONCURRENCY) {
    const slice = candidates.slice(i, i + ANNOTATE_CONCURRENCY);
    annotations.push(
      ...(await Promise.all(
        slice.map((candidate) => annotateOne(client, candidate, referenceBytes))
      ))
    );
  }

  logEvent('info', 'rekognition_annotated', {
    candidates: candidates.length,
    withFace: annotations.filter((annotation) => annotation.hasFace === true).length,
    scored: annotations.filter((annotation) => annotation.faceScore !== null).length,
  });
  return annotations;
};
