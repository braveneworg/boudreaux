/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sanitizeHtml from 'sanitize-html';

import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

/** Tags shared by every bio surface; image-capable surfaces add img/figure/figcaption. */
const BASE_BIO_ALLOWED_TAGS = [
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
  'span',
  'h2',
  'h3',
  'h4',
];

const BASE_BIO_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'rel', 'target'],
  span: ['style', 'class'],
};

/** Origin-branched link hardening: internal links (site-relative or own-host)
 *  stay same-tab and unhardened; external links carry the rel trio +
 *  target=_blank so an opened tab can never reach back through
 *  `window.opener`. */
const transformAnchor: sanitizeHtml.Transformer = (tagName, attribs) => {
  if (isInternalBioUrl(attribs.href ?? '')) {
    const { rel: _rel, target: _target, ...rest } = attribs;
    return { tagName, attribs: rest };
  }
  return {
    tagName,
    attribs: { ...attribs, rel: 'nofollow noopener noreferrer', target: '_blank' },
  };
};

/**
 * Rich-text allowlist for the long bio (Tiptap editor output + AI prose).
 * Section headings (`<h2>`–`<h4>`) are permitted so extensive, encyclopedic
 * bios can be structured; `<h1>` is intentionally excluded and reserved for the
 * page title. Both semantic (`<strong>`/`<em>`) and presentational (`<b>`/`<i>`)
 * emphasis are kept so no generated emphasis is ever stripped. Links are
 * branched by origin: internal links stay same-tab without rel restrictions,
 * external links are rewritten to carry `rel="nofollow noopener noreferrer"`
 * and `target="_blank"`. Inline `<img>` (re-hosted images), floated
 * `<figure>`/`<figcaption>` blocks (bio-figure classes + percentage width
 * only), and `<span>` font-size styling are permitted; the host of every
 * `<img>`/`<a>` is additionally gated by next/image `remotePatterns` and the
 * `BioHtml` renderer at display time.
 */
const BIO_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...BASE_BIO_ALLOWED_TAGS, 'img', 'figure', 'figcaption'],
  allowedAttributes: {
    ...BASE_BIO_ALLOWED_ATTRIBUTES,
    img: ['src', 'alt', 'width', 'height'],
    figure: ['class', 'style'],
    figcaption: ['class'],
  },
  allowedClasses: {
    figure: ['bio-figure', 'bio-figure--left', 'bio-figure--right', 'bio-figure--center'],
    figcaption: ['bio-figure-caption'],
    span: ['bio-figure-title', 'bio-figure-subtitle', 'bio-figure-attribution'],
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
    figure: {
      // Same two-pattern split as font-size above (integer, then decimal) to
      // avoid the `security/detect-unsafe-regex` false positive. Width is only
      // ever a percentage.
      width: [/^\d+%$/, /^\d+\.\d+%$/],
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
    a: transformAnchor,
  },
};

/** Strip-everything allowlist for the short bio, which is rendered as plain text. */
const BIO_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Short bio allowlist — same as the long bio but without `img`, `figure`, or
 *  `figcaption`. The short bio is a one-paragraph teaser rendered in listing
 *  cards and meta descriptions; inline images in that context break layout and
 *  are semantically wrong.  This also acts as a write-time guard so a manually
 *  pasted image in the admin editor cannot re-introduce the bug.
 */
const BIO_HTML_NO_IMAGES_OPTIONS: sanitizeHtml.IOptions = {
  ...BIO_HTML_OPTIONS,
  allowedTags: [...BASE_BIO_ALLOWED_TAGS],
  allowedAttributes: BASE_BIO_ALLOWED_ATTRIBUTES,
  allowedSchemesByTag: {
    a: ['http', 'https'],
  },
};

/**
 * Sanitizes the long bio HTML for safe redisplay in the admin view and on the
 * public bio page. This is the authoritative pass run before the value is
 * persisted; rendering surfaces can trust the stored string.
 *
 * @param html - Untrusted HTML (LLM output).
 * @returns Sanitized HTML limited to the bio allowlist, external links hardened.
 */
export const sanitizeBioHtml = (html: string): string =>
  sanitizeHtml(html, BIO_HTML_OPTIONS).trim();

/**
 * Sanitizes the short bio HTML, stripping `<img>` and `<figure>` tags entirely.
 * The short bio is a one-paragraph teaser; inline images break layout and
 * are never appropriate there. All other bio allowlist rules (links, emphasis,
 * etc.) apply unchanged.
 *
 * Use this wherever a shortBio is sanitized — at AI generation time and at
 * admin-save time — so no image can enter the field from either path.
 *
 * @param html - Untrusted HTML (editor or LLM output).
 * @returns Sanitized HTML with images removed, external links hardened.
 */
export const sanitizeBioHtmlNoImages = (html: string): string =>
  sanitizeHtml(html, BIO_HTML_NO_IMAGES_OPTIONS).trim();

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
