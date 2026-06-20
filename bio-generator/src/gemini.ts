/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bioProseSchema, DEFAULT_GEMINI_MODEL } from './types.js';

import type { ArtistFacts, BioProse } from './types.js';

type FetchFn = typeof fetch;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Allowed inline HTML in the bios — must stay within the web app's sanitizer
 * allowlist. Both semantic (`<strong>`/`<em>`) and presentational (`<b>`/`<i>`)
 * emphasis are permitted so no generated emphasis is ever stripped.
 */
const ALLOWED_TAGS =
  '<p>, <strong>, <b>, <em>, <i>, <ul>, <ol>, <li>, <a>, <img>, <h2>, <h3>, <h4>';

/** Upper bound on completion length so an extensive, image-rich bio is not truncated. */
const MAX_OUTPUT_TOKENS = 8192;

/** Combines real and display names for the research persona line. */
const artistFullName = (facts: ArtistFacts): string =>
  facts.realName && facts.realName !== facts.displayName
    ? `${facts.realName} (${facts.displayName})`
    : facts.displayName;

const buildSystemPrompt = (facts: ArtistFacts): string =>
  [
    'You are an exceptional writer across all domains with years of experience researching',
    `musical artists and their backgrounds. Investigate deeply the biography of ${artistFullName(facts)}.`,
    'Ground every claim ONLY in the provided source material and facts; never invent discographies,',
    'dates, awards, members, labels, or URLs, and omit anything unknown rather than guessing.',
    'Rewrite all source material in your own original words — never copy sentences or distinctive phrasing.',
    'NEVER link to streaming or listening services (Spotify, Apple Music, SoundCloud, Bandcamp,',
    'YouTube Music, Tidal, Deezer, Amazon Music, or any other) — link only to INFORMATIVE sources',
    'such as the official site, Wikipedia, press, interviews, or the label.',
    'NEVER output a "Discovered Links", "Sources", "References", or link-list section anywhere.',
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
    'shortBio: a rich, engaging biography of AT LEAST 200 words written as flowing HTML prose',
    'in one or more <p> paragraphs. Requirements:',
    '- Weave SEVERAL inline <a href="..."> links to informative sources from the reference URLs,',
    "  each with VARIED, descriptive anchor text (e.g. the artist's official site, a Wikipedia",
    '  article) — never reuse one phrase and never write "click here".',
    '- Use <strong>/<em> emphasis where it helps; keep it to prose, never a list of links.',
    '- Do NOT add a "Discovered Links"/"Sources"/"References" section and do NOT link to any',
    '  streaming/listening service.',
    '',
    'longBio: an extensive, in-depth biography of roughly 800–1500 words. Requirements:',
    '- Organize into several <h2> sections (e.g. Background, Career, Musical style, Notable works,',
    '  Collaborations, Legacy), each with <h3> subheadings where the material warrants it.',
    '- Use rich formatting throughout: <strong> for key names/terms, <em> for emphasis, and',
    '  <ul>/<ol> lists where appropriate (e.g. notable releases, collaborators, influences).',
    '- Weave SEVERAL inline <a href="..."> links to informative sources from the reference URLs,',
    '  VARYING the wording around each link — never reuse one phrase.',
    '- Embed several inline images of the artist and related artwork using <img src="image:N" alt="...">,',
    '  where N is the 0-indexed position from the Available images list above; place them between',
    '  paragraphs near the relevant text. The app swaps each placeholder for the hosted image URL.',
    '- Do NOT add a "Sources", "References", or "Discovered Links" list, do NOT tell the reader to',
    '  visit a link, and do NOT link to any streaming/listening service.',
    '- Scale length down gracefully when sources are thin; never pad with invented detail.',
    `Use only these HTML tags: ${ALLOWED_TAGS}.`,
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "shortBio": "the 200+ word rich-HTML short bio with several inline informative links",',
    '  "longBio": "the extensive, image-rich HTML article described above",',
    '  "genres": "comma-separated genres or empty string",',
    '  "primaryImageIndexes": [indexes of the 2-3 images that best identify the artist]',
    '}',
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * Generates short + long bio prose with the Gemini `generateContent` API in JSON
 * mode. The model writes prose only; it is given the real facts gathered from
 * MusicBrainz/Wikidata/web so the text stays grounded, and it never produces the
 * image/link URLs the caller ultimately returns. Gemini's 1M-token context means
 * the full source material fits without trimming.
 *
 * @param facts - Grounding facts assembled by the handler.
 * @param apiKey - Gemini API key (resolved from SSM), sent via `x-goog-api-key`.
 * @param model - Gemini model id; defaults to {@link DEFAULT_GEMINI_MODEL}.
 * @param fetchFn - Injectable fetch (defaults to global) for testability.
 * @returns Validated prose plus the model's image ranking.
 */
export const generateProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  fetchFn: FetchFn = fetch
): Promise<BioProse> => {
  const response = await fetchFn(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(facts) }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(facts) }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status})`);
  }

  const body = (await response.json()) as GeminiResponse;
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('Gemini returned an empty completion');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Gemini returned non-JSON content');
  }

  return bioProseSchema.parse(parsed);
};
