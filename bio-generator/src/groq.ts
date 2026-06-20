/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEFAULT_GROQ_MODEL, groqProseSchema } from './types.js';

import type { ArtistFacts, GroqProse } from './types.js';

type FetchFn = typeof fetch;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Allowed inline HTML in the longBio — must stay within the web app's sanitizer allowlist. */
const ALLOWED_TAGS = '<p>, <strong>, <em>, <ul>, <ol>, <li>, <a>, <h2>, <h3>, <h4>';

/** Upper bound on completion length so an extensive multi-section bio is not truncated. */
const MAX_COMPLETION_TOKENS = 4096;

const SYSTEM_PROMPT = [
  'You are a music journalist writing an extensive, encyclopedic artist biography for a record label website.',
  'Write in a neutral, factual, Wikipedia-style tone with real depth.',
  'Ground every claim ONLY in the provided source material and facts.',
  'Never invent discographies, dates, awards, members, labels, or URLs; omit anything unknown rather than guessing.',
  'Rewrite all source material in your own original words — never copy sentences or distinctive phrasing.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

/** Formats the active-years line from MusicBrainz life-span data, if present. */
const activeYears = (facts: ArtistFacts): string => {
  if (!facts.beginDate) return '';
  const end = facts.endDate ? facts.endDate : 'present';
  return `Active: ${facts.beginDate}–${end}`;
};

const buildUserPrompt = (facts: ArtistFacts): string => {
  const sourceUrls = facts.sourceUrls?.length
    ? facts.sourceUrls
    : [facts.wikipediaUrl, facts.officialUrl].filter((url): url is string => Boolean(url));

  const lines: string[] = [
    `Artist display name: ${facts.displayName}`,
    facts.realName ? `Real name: ${facts.realName}` : '',
    facts.akaNames ? `Also known as: ${facts.akaNames}` : '',
    facts.artistType ? `Type: ${facts.artistType}` : '',
    facts.area ? `Origin: ${facts.area}` : '',
    activeYears(facts),
    facts.existingGenres ? `Known genres: ${facts.existingGenres}` : '',
    facts.tags?.length ? `MusicBrainz tags: ${facts.tags.join(', ')}` : '',
    facts.musicBrainzId ? `MusicBrainz id: ${facts.musicBrainzId}` : '',
    facts.wikipediaUrl ? `Wikipedia: ${facts.wikipediaUrl}` : '',
    facts.officialUrl ? `Official site: ${facts.officialUrl}` : '',
    facts.description ? `Editor notes: ${facts.description}` : '',
    facts.imageTitles.length
      ? `Available images (0-indexed): ${facts.imageTitles.map((t, i) => `${i}=${t}`).join('; ')}`
      : '',
    '',
    facts.sourceText
      ? [
          'SOURCE MATERIAL (rewrite in your own words — do NOT copy phrasing):',
          '"""',
          facts.sourceText,
          '"""',
        ].join('\n')
      : 'No long-form source material was found; write only what the facts above support.',
    '',
    sourceUrls.length
      ? `Reference URLs available for inline links (use ONLY these, verbatim): ${sourceUrls.join(', ')}`
      : 'No reference URLs are available; do not add any links.',
    '',
    'Write the longBio as an extensive biography of roughly 600–1200 words, organized into',
    'several <h2> sections (e.g. Background, Career, Musical style, Notable works,',
    'Collaborations, Legacy) with <h3> subsections where helpful. Scale the length down',
    'gracefully when sources are thin — never pad with invented detail.',
    'Weave 1–4 of the reference URLs above into the prose as inline <a href="..."> links where',
    'they read naturally. Do NOT add a "Sources", "References", or attribution list, and do NOT',
    'tell the reader to visit a link — describe the information directly instead.',
    `Use only these HTML tags: ${ALLOWED_TAGS}.`,
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "shortBio": "2-3 sentence plain-text teaser (no HTML)",',
    '  "longBio": "the extensive HTML article described above",',
    '  "genres": "comma-separated genres or empty string",',
    '  "primaryImageIndexes": [indexes of the 2-3 images that best identify the artist]',
    '}',
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * Generates short + long bio prose with Groq's OpenAI-compatible chat API in
 * JSON mode. The model writes prose only; it is given the real facts gathered
 * from MusicBrainz/Wikidata so the text stays grounded, and it never produces
 * the image/link URLs the caller ultimately returns.
 *
 * @param facts - Grounding facts assembled by the handler.
 * @param apiKey - Groq API key (resolved from SSM).
 * @param model - Groq model id; defaults to {@link DEFAULT_GROQ_MODEL}.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns Validated prose plus the model's image ranking.
 */
export const generateProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GROQ_MODEL,
  fetchFn: FetchFn = fetch
): Promise<GroqProse> => {
  const response = await fetchFn(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(facts) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq request failed (${response.status})`);
  }

  const body = (await response.json()) as GroqChatResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned an empty completion');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Groq returned non-JSON content');
  }

  return groqProseSchema.parse(parsed);
};
