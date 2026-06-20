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

const SYSTEM_PROMPT = [
  'You are a music journalist writing factual artist biographies for a record label website.',
  'Use ONLY the grounding facts provided. Do not invent discographies, dates, awards, or URLs.',
  'If a fact is unknown, omit it rather than guessing.',
  'Respond with a single JSON object and nothing else.',
].join(' ');

const buildUserPrompt = (facts: ArtistFacts): string => {
  const lines: string[] = [
    `Artist display name: ${facts.displayName}`,
    facts.realName ? `Real name: ${facts.realName}` : '',
    facts.akaNames ? `Also known as: ${facts.akaNames}` : '',
    facts.existingGenres ? `Known genres: ${facts.existingGenres}` : '',
    facts.musicBrainzId ? `MusicBrainz id: ${facts.musicBrainzId}` : '',
    facts.wikipediaUrl ? `Wikipedia: ${facts.wikipediaUrl}` : '',
    facts.officialUrl ? `Official site: ${facts.officialUrl}` : '',
    facts.description ? `Editor notes: ${facts.description}` : '',
    facts.imageTitles.length
      ? `Available images (0-indexed): ${facts.imageTitles.map((t, i) => `${i}=${t}`).join('; ')}`
      : '',
    '',
    'Weave the Wikipedia and official-site URLs above into the longBio as inline',
    '<a href="..."> links where it reads naturally (1-3 links). Use ONLY those URLs;',
    'do not invent links and do not list sources or attributions separately.',
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "shortBio": "1-2 sentence plain-text teaser",',
    '  "longBio": "3-5 short HTML paragraphs using only <p>, <strong>, <em>, <ul>, <li>, <a> tags",',
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
      temperature: 0.4,
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
