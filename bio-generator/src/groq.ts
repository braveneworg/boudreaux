/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEFAULT_GROQ_MODEL, DEFAULT_GROQ_TOKEN_LIMIT, groqProseSchema } from './types.js';

import type { ArtistFacts, GroqProse } from './types.js';

type FetchFn = typeof fetch;

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/** Allowed inline HTML in the longBio — must stay within the web app's sanitizer allowlist. */
const ALLOWED_TAGS = '<p>, <strong>, <em>, <ul>, <ol>, <li>, <a>, <img>, <h2>, <h3>, <h4>';

/** Reserved completion budget — ample for a 1500-word, image-rich HTML article. */
const MAX_COMPLETION_TOKENS = 5000;

/** Headroom below the ceiling to absorb tokenizer variance in the chars≈tokens estimate. */
const TOKEN_SAFETY_MARGIN = 1000;

/** Conservative chars-per-token ratio (HTML/punctuation inflate the true token count). */
const CHARS_PER_TOKEN = 3.5;

/**
 * Char budget for the assembled system + user prompt so prompt + reserved
 * completion stay under Groq's per-request token ceiling. The ceiling is
 * resolved per environment from SSM (free-tier default 12k) and passed in.
 */
const promptCharBudget = (tokenLimit: number): number =>
  Math.floor((tokenLimit - MAX_COMPLETION_TOKENS - TOKEN_SAFETY_MARGIN) * CHARS_PER_TOKEN);

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
    'shortBio: a vivid 2–3 sentence teaser. It may weave in at most ONE inline <a href="..."> link',
    'from the reference URLs; never append a list of links.',
    '',
    'longBio: an extensive, in-depth biography of roughly 800–1500 words. Requirements:',
    '- Organize into several <h2> sections (e.g. Background, Career, Musical style, Notable works,',
    '  Collaborations, Legacy), each with <h3> subheadings where the material warrants it.',
    '- Weave several inline <a href="..."> links from the reference URLs into the prose. VARY the',
    '  wording around each link — never reuse one phrase (e.g. not "visit X for more info" repeatedly).',
    '- Embed several inline images of the artist and related artwork using <img src="image:N" alt="...">,',
    '  where N is the 0-indexed position from the Available images list above; place them between',
    '  paragraphs near the relevant text. The app swaps each placeholder for the hosted image URL.',
    '- Use <ul> and <ol> lists where appropriate (e.g. notable releases, collaborators, influences).',
    '- Do NOT add a "Sources", "References", or attribution list, and do NOT tell the reader to visit',
    '  a link — describe the information directly instead.',
    '- Scale length down gracefully when sources are thin; never pad with invented detail.',
    `Use only these HTML tags: ${ALLOWED_TAGS}.`,
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "shortBio": "2-3 sentence teaser; plain text or a single inline <a> link, no other HTML",',
    '  "longBio": "the extensive, image-rich HTML article described above",',
    '  "genres": "comma-separated genres or empty string",',
    '  "primaryImageIndexes": [indexes of the 2-3 images that best identify the artist]',
    '}',
  ];
  return lines.filter(Boolean).join('\n');
};

/** Trims to `length`, backing up to the last paragraph break past the halfway mark so prose stays coherent. */
const truncateAtBreak = (text: string, length: number): string => {
  if (text.length <= length) return text;
  const head = text.slice(0, length);
  const lastBreak = head.lastIndexOf('\n');
  return (lastBreak > length / 2 ? head.slice(0, lastBreak) : head).trim();
};

/**
 * Shrinks `facts.sourceText` (the only unbounded input) just enough that the
 * assembled system + user prompt fits {@link promptCharBudget}. Wikipedia and
 * web-search content are each capped upstream, but their merged size can still
 * blow Groq's per-request token ceiling — this is the single chokepoint that
 * guarantees the request never 413s, regardless of how many sources combine.
 */
const fitToBudget = (facts: ArtistFacts, tokenLimit: number): ArtistFacts => {
  if (!facts.sourceText) return facts;
  const overage =
    buildSystemPrompt(facts).length + buildUserPrompt(facts).length - promptCharBudget(tokenLimit);
  if (overage <= 0) return facts;
  const target = Math.max(0, facts.sourceText.length - overage);
  return { ...facts, sourceText: truncateAtBreak(facts.sourceText, target) };
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
 * @param tokenLimit - Groq per-request token ceiling (resolved from SSM);
 * defaults to {@link DEFAULT_GROQ_TOKEN_LIMIT}. Source material is trimmed to
 * keep prompt + completion under it, preventing HTTP 413s.
 * @returns Validated prose plus the model's image ranking.
 */
export const generateProse = async (
  facts: ArtistFacts,
  apiKey: string,
  model: string = DEFAULT_GROQ_MODEL,
  fetchFn: FetchFn = fetch,
  tokenLimit: number = DEFAULT_GROQ_TOKEN_LIMIT
): Promise<GroqProse> => {
  const fitted = fitToBudget(facts, tokenLimit);
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
        { role: 'system', content: buildSystemPrompt(fitted) },
        { role: 'user', content: buildUserPrompt(fitted) },
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
