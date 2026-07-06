/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Parsed subset of a page's `<head>` metadata (Open Graph / Twitter / HTML). */
export interface OpenGraphTags {
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

/** Region scanned for meta tags when the document has no `</head>` (~512 KB). */
const HEAD_BYTE_CAP = 512 * 1024;

/** Decode the HTML entities that appear in meta content (`&amp;` decoded last
 *  so an already-decoded `&` is never re-interpreted). */
const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-fA-F]+);/g, (_full: string, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_full: string, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** Attribute-order-independent parse of one tag's attributes into a
 *  lowercase-keyed, entity-decoded map. Handles double, single, and unquoted
 *  values. */
const parseAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
  for (const match of tag.matchAll(attributePattern)) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[name.toLowerCase()] = decodeEntities(doubleQuoted ?? singleQuoted ?? unquoted ?? '');
  }
  return attributes;
};

/** Resolve a possibly-relative URL against the page URL; `null` if unusable. */
const resolveUrl = (value: string | null, base: string): string | null => {
  if (!value) return null;
  try {
    return new URL(value, base).href;
  } catch {
    return null;
  }
};

/**
 * Extract a bounded set of `<head>` metadata from raw HTML. Pure (no I/O); the
 * caller (link-preview service) sanitizes the returned text. A parse miss
 * degrades to `null` rather than throwing.
 */
export const extractOpenGraph = (html: string, pageUrl: string): OpenGraphTags => {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html.slice(0, HEAD_BYTE_CAP) : html.slice(0, headEnd);

  const metaTags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => parseAttributes(match[0]));

  const metaContent = (key: string): string | null => {
    for (const attributes of metaTags) {
      const identifier = (attributes.property ?? attributes.name)?.toLowerCase();
      if (identifier === key) {
        const content = attributes.content?.trim();
        if (content) return content;
      }
    }
    return null;
  };

  const titleTagText = (): string | null => {
    const match = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const text = decodeEntities(match[1]).trim();
    return text.length > 0 ? text : null;
  };

  const faviconHref = (): string | null => {
    const linkTags = [...head.matchAll(/<link\b[^>]*>/gi)].map((match) =>
      parseAttributes(match[0])
    );
    for (const attributes of linkTags) {
      const tokens = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
      if (tokens.some((token) => token.includes('icon'))) {
        const href = attributes.href?.trim();
        if (href) return href;
      }
    }
    return null;
  };

  return {
    title: metaContent('og:title') ?? metaContent('twitter:title') ?? titleTagText(),
    description:
      metaContent('og:description') ??
      metaContent('twitter:description') ??
      metaContent('description'),
    siteName: metaContent('og:site_name'),
    imageUrl: resolveUrl(metaContent('og:image') ?? metaContent('twitter:image'), pageUrl),
    faviconUrl: resolveUrl(faviconHref(), pageUrl),
  };
};
