/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Default teaser length — a short header preview, not the full short bio. */
const DEFAULT_TEASER_WORDS = 30;

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');

/**
 * Derives a short plain-text teaser from rich bio HTML for surfaces that show a
 * preview rather than the full short bio (e.g. the artist detail-page header).
 * Tags are stripped, entities decoded, whitespace collapsed, and the text capped
 * to `maxWords` with a trailing ellipsis. Client-safe (no DOM, no `server-only`)
 * — the input is already sanitized, so tag-stripping is for display only.
 *
 * @param html - Sanitized bio HTML (or plain text).
 * @param maxWords - Word cap before truncating; defaults to {@link DEFAULT_TEASER_WORDS}.
 * @returns The plain-text teaser (empty string for empty input).
 */
export const toBioTeaser = (html: string, maxWords: number = DEFAULT_TEASER_WORDS): string => {
  if (!html) return '';

  const text = decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  const words = text.split(' ');
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ')}…`;
};
