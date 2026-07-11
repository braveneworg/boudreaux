/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Re-hosting metadata for one generated bio image, keyed by its 0-based index. */
export interface BioFigureImageMeta {
  url: string;
  alt: string | null;
  title: string | null;
  attribution: string | null;
}

/** Maximum number of floated figures emitted into a single bio. */
export const MAX_BIO_FIGURES = 5;

/** Fixed width, in percent, of every emitted figure (matches the sanitizer bound). */
export const BIO_FIGURE_WIDTH_PERCENT = 40;

/** Matches a whole `<img …>` tag without crossing a `>` boundary (linear). */
const IMG_TAG = /<img\b[^>]*>/g;

/** Extracts the placeholder index from `src="image:N"` / `src='image:N'`. */
const PLACEHOLDER_SRC = /src=(["'])image:(\d+)\1/;

/** Matches the tag's alt attribute — whitespace-anchored so `data-alt` never
 *  matches; separate double-/single-quoted alternatives so a value may contain
 *  the other quote character (e.g. `alt="Ceschi's guitar"`). */
const ALT_ATTR = /\salt=(?:"([^"]*)"|'([^']*)')/;

/** Reads the original tag's alt attribute value, or null when absent. */
const readOriginalAlt = (tag: string): string | null => {
  const match = ALT_ATTR.exec(tag);
  return match ? (match[1] ?? match[2] ?? '') : null;
};

/** Escapes the five HTML entities so a raw value can never break out of an
 *  attribute or element before the downstream sanitizer runs. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Builds a single caption span, or an empty string when the text is blank. */
const captionSpan = (className: string, text: string | null): string => {
  const trimmed = text?.trim();
  return trimmed ? `<span class="${className}">${escapeHtml(trimmed)}</span>` : '';
};

/** Builds the `<figcaption>`, or an empty string when both fields are blank. */
const buildFigcaption = (title: string | null, attribution: string | null): string => {
  const spans =
    captionSpan('bio-figure-title', title) + captionSpan('bio-figure-attribution', attribution);
  return spans ? `<figcaption class="bio-figure-caption">${spans}</figcaption>` : '';
};

/** Emits the byte-exact `figure.bio-figure` markup the TipTap extension parses. */
const buildFigure = (meta: BioFigureImageMeta, alt: string, float: 'left' | 'right'): string => {
  const img = `<img src="${escapeHtml(meta.url)}" alt="${escapeHtml(alt)}">`;
  const figcaption = buildFigcaption(meta.title, meta.attribution);
  return (
    `<figure class="bio-figure bio-figure--${float}" style="width: ${BIO_FIGURE_WIDTH_PERCENT}%">` +
    `${img}${figcaption}</figure>`
  );
};

/**
 * Rewrites the generator's `<img src="image:N">` placeholders in long-bio HTML
 * into floated, captioned `figure.bio-figure` blocks — alternating right/left at
 * a fixed 40% width, capped at {@link MAX_BIO_FIGURES}. Only whole placeholder
 * tags with a resolvable index are replaced; every other tag (unmapped index,
 * real `http(s)` src, or a tag matched after the cap) is left untouched so the
 * caller's src-swap fallback can handle it. Runs BEFORE sanitization, so every
 * interpolated value is entity-escaped. Pure and deterministic.
 *
 * @param html - The raw long-bio HTML from the generator.
 * @param metaByIndex - Map of original image index → re-hosting metadata.
 * @returns The HTML with resolvable placeholders replaced by figure markup.
 */
export const composeBioFigures = (
  html: string,
  metaByIndex: Map<number, BioFigureImageMeta>
): string => {
  let emitted = 0;
  return html.replace(IMG_TAG, (tag) => {
    if (emitted >= MAX_BIO_FIGURES) return tag;
    const placeholder = PLACEHOLDER_SRC.exec(tag);
    if (!placeholder) return tag;
    const meta = metaByIndex.get(Number(placeholder[2]));
    if (!meta) return tag;
    const alt = meta.alt ?? readOriginalAlt(tag) ?? '';
    const float = emitted % 2 === 0 ? 'right' : 'left';
    emitted += 1;
    return buildFigure(meta, alt, float);
  });
};
