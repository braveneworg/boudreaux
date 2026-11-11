/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sanitizeHtml from 'sanitize-html';

import { isHttpUrl } from '@/lib/utils/is-http-url';

/**
 * The two allowlists for a submission's text (ADR-0025). The stored HTML is
 * always the output of one of these: the editor's toolbar is a convenience,
 * never the control. Unlike a bio, a submission is written by a member of the
 * public, so every link is hardened, a link to this site included.
 */

/** Tags the about may hold: paragraphs, line breaks, bold and italic. */
const ABOUT_TAGS = ['p', 'br', 'strong', 'em'];

/**
 * A tag name on no allowlist. A link that may not stay a link is renamed to
 * it, and the `discard` mode then drops the tag and keeps its text.
 */
const UNWRAPPED = 'submission-unwrapped';

/**
 * A link survives only with an absolute http(s) href, and then with exactly
 * three attributes: its href and the hardening pair, set here and never taken
 * from the input. Any other link is unwrapped to its text.
 */
const transformAnchor: sanitizeHtml.Transformer = (_tagName, { href = '' }) => {
  const attribs: sanitizeHtml.Attributes = isHttpUrl(href)
    ? { href: href.trim(), rel: 'nofollow noopener noreferrer', target: '_blank' }
    : {};

  return { tagName: isHttpUrl(href) ? 'a' : UNWRAPPED, attribs };
};

const ABOUT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ABOUT_TAGS,
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  // The editor writes <strong>/<em>; pasted HTML may carry the presentational pair.
  transformTags: { b: 'strong', i: 'em' },
};

const WRITING_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ABOUT_TAGS, 'h2', 'h3', 'a'],
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: { b: 'strong', i: 'em', a: transformAnchor },
};

const TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Decode the entities sanitize-html writes into text and attribute values. */
const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/**
 * Sanitizes a submission's about: paragraphs, line breaks, bold and italic,
 * with no attributes at all. Anything else is removed and its text kept; a
 * script goes with its contents.
 *
 * @param html - Untrusted HTML from the about editor.
 * @returns The HTML to store.
 */
export const sanitizeSubmissionAbout = (html: string): string =>
  sanitizeHtml(html, ABOUT_OPTIONS).trim();

/**
 * Sanitizes a submission's writing: the about's tags plus `<h2>`, `<h3>` and
 * links. Every link that stays is an absolute http(s) link carrying
 * `rel="nofollow noopener noreferrer"` and `target="_blank"`.
 *
 * @param html - Untrusted HTML from the writing editor.
 * @returns The HTML to store.
 */
export const sanitizeSubmissionWriting = (html: string): string =>
  sanitizeHtml(html, WRITING_OPTIONS).trim();

/**
 * The length of submission HTML as the text a reader sees: markup removed,
 * entities counted as the character they stand for, outer whitespace ignored.
 * The length limits are measured with this, so formatting never costs
 * characters.
 */
export const submissionTextLength = (html: string): number =>
  decodeEntities(sanitizeHtml(html, TEXT_OPTIONS)).trim().length;

/**
 * The href of every link in a writing, in document order and with repeats.
 * Reads the shape {@link sanitizeSubmissionWriting} writes, so pass it
 * sanitized HTML: a link's first attribute is always its href.
 */
export const submissionWritingLinks = (html: string): string[] =>
  [...html.matchAll(/<a href="([^"]*)"/g)].map(([, href = '']) => decodeEntities(href));
