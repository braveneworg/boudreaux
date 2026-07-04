/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { fetchWithRetry } from './lib/http.js';
import { logEvent, toErrorMessage } from './lib/log.js';

import type { FetchRetryOptions } from './lib/http.js';
import type { BioImage } from './types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const VISION_BATCH_SIZE = 10;
export const VISION_MIN_CONFIDENCE = 0.5;
export const VISION_FETCH_MAX_BYTES = 1_500_000;
export const VISION_FETCH_TIMEOUT_MS = 8_000;
export const VISION_FETCH_CONCURRENCY = 8;
/** One retry only — vision shares the Lambda budget with the prose ensemble. */
const VISION_RETRIES = 1;
const VISION_TEMPERATURE = 0.1;
const VISION_MAX_OUTPUT_TOKENS = 4096;

export interface VisionContext {
  artistNames: string[];
  releaseTitles: string[];
}

/** Gemini model credentials for a vision API call. */
export interface VisionApiConfig {
  apiKey: string;
  model: string;
}

const visionVerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      verdict: z.enum(['artist_photo', 'album_cover', 'reject']),
      confidence: z.number().min(0).max(1),
      alt: z.string().optional(),
    })
  ),
});

interface FetchedCandidate {
  image: BioImage;
  mimeType: string;
  base64: string;
}

/** Fetches one candidate's bytes; null (drop) on any failure — fail closed. */
const fetchCandidate = async (
  image: BioImage,
  fetchFn: typeof fetch
): Promise<FetchedCandidate | null> => {
  try {
    const response = await fetchFn(image.url, {
      signal: AbortSignal.timeout(VISION_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!mimeType.startsWith('image/')) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > VISION_FETCH_MAX_BYTES) return null;
    return { image, mimeType, base64: Buffer.from(bytes).toString('base64') };
  } catch {
    return null;
  }
};

/** Pool-limited candidate fetching, preserving input order of survivors. */
const fetchCandidates = async (
  candidates: BioImage[],
  fetchFn: typeof fetch
): Promise<FetchedCandidate[]> => {
  const fetched: Array<FetchedCandidate | null> = [];
  for (let i = 0; i < candidates.length; i += VISION_FETCH_CONCURRENCY) {
    const batch = candidates.slice(i, i + VISION_FETCH_CONCURRENCY);
    fetched.push(...(await Promise.all(batch.map((image) => fetchCandidate(image, fetchFn)))));
  }
  return fetched.filter((entry): entry is FetchedCandidate => entry !== null);
};

const buildVisionSystemPrompt = ({ artistNames, releaseTitles }: VisionContext): string =>
  [
    'You verify candidate images for a musician biography.',
    `The artist: ${artistNames.join(' / ')}.`,
    releaseTitles.length ? `Known releases: ${releaseTitles.join('; ')}.` : '',
    'For EACH numbered image decide exactly one verdict:',
    '"artist_photo" — a photograph featuring this artist (alone or alongside other people);',
    '"album_cover" — cover art for one of this artist\'s releases or collaborations;',
    '"reject" — anything else: other people without the artist, logos, unrelated artwork,',
    'venues or crowds without the artist, merchandise, text graphics.',
    'Also write a short alt description (max 120 characters) for accepted images.',
    'When unsure, reject. Respond with a single JSON object and nothing else.',
  ]
    .filter(Boolean)
    .join(' ');

/** Assembles the interleaved text/image parts for one batched request. */
const buildVisionParts = (
  batch: FetchedCandidate[]
): Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> => [
  ...batch.flatMap((entry, index) => [
    { text: `Image ${index}:` },
    { inline_data: { mime_type: entry.mimeType, data: entry.base64 } },
  ]),
  {
    text:
      'Return JSON: {"verdicts": [{"index": <image number>, "verdict": ' +
      '"artist_photo"|"album_cover"|"reject", "confidence": 0..1, "alt": "short description"}]}',
  },
];

const verifyBatch = async (
  batch: FetchedCandidate[],
  context: VisionContext,
  config: VisionApiConfig,
  options: FetchRetryOptions
): Promise<BioImage[]> => {
  const { apiKey, model } = config;
  const response = await fetchWithRetry(
    `${GEMINI_API_BASE}/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildVisionSystemPrompt(context) }] },
        contents: [{ role: 'user', parts: buildVisionParts(batch) }],
        generationConfig: {
          temperature: VISION_TEMPERATURE,
          maxOutputTokens: VISION_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
    },
    { retries: VISION_RETRIES, ...options }
  );
  if (!response.ok) {
    throw new Error(`Gemini vision request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini vision returned an empty completion');
  const { verdicts } = visionVerdictSchema.parse(JSON.parse(text));

  return verdicts
    .filter(
      (verdict) => verdict.verdict !== 'reject' && verdict.confidence >= VISION_MIN_CONFIDENCE
    )
    .flatMap((verdict) => {
      const entry = batch.at(verdict.index);
      if (!entry) return [];
      return [
        {
          ...entry.image,
          kind: verdict.verdict === 'album_cover' ? ('cover' as const) : ('photo' as const),
          alt: verdict.alt?.trim() || entry.image.title || null,
        },
      ];
    });
};

/**
 * Subject-verifies scraped image candidates with Gemini vision, in batches of
 * {@link VISION_BATCH_SIZE}. Only candidates positively identified as a photo
 * featuring the artist or as cover art for the artist's releases survive.
 * FAIL-CLOSED at every stage: unfetchable/oversized/non-image candidates and
 * failed batches are dropped — provenance-guaranteed sources (Commons, CAA)
 * never route through here, so an outage degrades to those alone.
 */
export const verifyScrapedImages = async (
  candidates: BioImage[],
  context: VisionContext,
  config: VisionApiConfig,
  options: FetchRetryOptions = {}
): Promise<BioImage[]> => {
  if (!candidates.length) return [];
  const fetchFn = options.fetchFn ?? fetch;
  const fetched = await fetchCandidates(candidates, fetchFn);
  logEvent('info', 'vision_candidates', { total: candidates.length, fetched: fetched.length });
  if (!fetched.length) return [];

  const kept: BioImage[] = [];
  for (let i = 0; i < fetched.length; i += VISION_BATCH_SIZE) {
    const batch = fetched.slice(i, i + VISION_BATCH_SIZE);
    try {
      kept.push(...(await verifyBatch(batch, context, config, options)));
    } catch (err) {
      // Fail closed: an unverifiable batch ships nothing from that batch.
      logEvent('warn', 'vision_batch_failed', { size: batch.length, error: toErrorMessage(err) });
    }
  }
  logEvent('info', 'vision_verified', { kept: kept.length });
  return kept;
};
