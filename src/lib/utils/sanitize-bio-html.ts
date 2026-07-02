/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sanitizeHtml from 'sanitize-html';

/**
 * Rich-text allowlist for the long bio (Tiptap editor output + AI prose).
 * Section headings (`<h2>`–`<h4>`) are permitted so extensive, encyclopedic
 * bios can be structured; `<h1>` is intentionally excluded and reserved for the
 * page title. Both semantic (`<strong>`/`<em>`) and presentational (`<b>`/`<i>`)
 * emphasis are kept so no generated emphasis is ever stripped. Links are
 * force-rewritten to carry `rel="nofollow noopener noreferrer"` and
 * `target="_blank"` so an opened tab can never reach back through
 * `window.opener`. Inline `<img>` (re-hosted images) and `<span>` font-size
 * styling are permitted; the host of every `<img>`/`<a>` is additionally gated
 * by next/image `remotePatterns` and the `BioHtml` renderer at display time.
 */
const BIO_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'span',
    'h2',
    'h3',
    'h4',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height'],
    span: ['style'],
  },
  allowedStyles: {
    '*': {
      // Integer and decimal sizes are split into two patterns (rather than one
      // with a nested `(?:\.\d+)?`) so neither nests a `+` inside `?` — that
      // shape trips `security/detect-unsafe-regex` despite being linear.
      'font-size': [
        /^\d+(?:px|em|rem|%)$/,
        /^\d+\.\d+(?:px|em|rem|%)$/,
        /^(?:x-small|small|medium|large|x-large|larger|smaller)$/,
      ],
    },
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    a: ['http', 'https'],
    img: ['http', 'https'],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  transformTags: {
    // Harden every link for the untrusted-content context; PR 2 branches this
    // by origin (internal links keep same-tab, no rel restrictions).
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'nofollow noopener noreferrer', target: '_blank' },
    }),
  },
};

/** Strip-everything allowlist for the short bio, which is rendered as plain text. */
const BIO_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/**
 * Sanitizes the long bio HTML for safe redisplay in the admin view and on the
 * public bio page. This is the authoritative pass run before the value is
 * persisted; rendering surfaces can trust the stored string.
 *
 * @param html - Untrusted HTML (LLM output).
 * @returns Sanitized HTML limited to the bio allowlist, links hardened.
 */
export const sanitizeBioHtml = (html: string): string =>
  sanitizeHtml(html, BIO_HTML_OPTIONS).trim();

/**
 * Sanitizes a short bio / attribution / label to plain text, discarding any
 * markup entirely. The result is consumed as plain text (React children, meta
 * descriptions, `alt`), never as raw HTML, so the `&`/`<`/`>` that sanitize-html
 * re-encodes in text nodes are decoded back to their literal characters —
 * otherwise React/Next would double-encode them and users would see `&amp;`.
 *
 * @param value - Untrusted text that may contain markup.
 * @returns The text with all tags removed and basic entities decoded.
 */
export const sanitizeBioText = (value: string): string =>
  sanitizeHtml(value, BIO_TEXT_OPTIONS)
    .trim()
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
