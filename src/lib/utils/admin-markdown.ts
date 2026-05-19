/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Inline node kinds produced by {@link parseAdminMarkdown}. Block-level
 * markdown (headings, lists, code fences) is intentionally not
 * supported — chat messages are short single-paragraph posts and the
 * supported surface is limited to inline emphasis, bold, and links.
 *
 * The string `value` / `text` fields are raw and may contain mention
 * tokens — callers should run them through `tokenizeMentions` before
 * rendering so admin formatting and `@mentions` compose.
 */
export type AdminMarkdownNode =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'link'; text: string; href: string; external: boolean };

interface ParseOptions {
  /**
   * Hostname of the current site, used to classify links as internal or
   * external. When omitted, only paths beginning with `/` (and not
   * `//`) are treated as internal; everything else is external. Match
   * is case-insensitive and ignores the port.
   */
  siteHost?: string;
}

/**
 * URL schemes accepted inside `[text](href)` link syntax. Anything else
 * (`javascript:`, `data:`, `vbscript:` etc.) is dropped — the link
 * falls back to plain text so a compromised admin account can't post a
 * dangerous href.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function normaliseHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, '');
}

/**
 * Decide whether a safe href points outside the current site. Bare
 * paths (`/foo`) are always internal; everything else compares the URL
 * hostname against {@link ParseOptions.siteHost}.
 */
function isExternalHref(href: string, siteHost: string | undefined): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return false;
  try {
    const url = new URL(href);
    if (url.protocol === 'mailto:') return true;
    if (!siteHost) return true;
    return normaliseHost(url.host) !== normaliseHost(siteHost);
  } catch {
    return false;
  }
}

/**
 * Verify the href is one we're willing to render as a clickable link.
 * Returns the normalised string on success or null when the link must
 * be downgraded to plain text.
 */
function sanitiseHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const url = new URL(trimmed);
    return SAFE_SCHEMES.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

interface InlineMatch {
  node: AdminMarkdownNode;
  consumed: number;
}

function tryLink(body: string, i: number, siteHost: string | undefined): InlineMatch | null {
  if (body[i] !== '[') return null;
  // Scan for the matching `]` that's followed immediately by `(`. Bail
  // out at newlines so a stray `[` near the end of one line can't
  // greedily swallow content from a later line.
  let depth = 1;
  let close = -1;
  for (let j = i + 1; j < body.length; j++) {
    const ch = body[j];
    if (ch === '\n') return null;
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        close = j;
        break;
      }
    }
  }
  if (close === -1 || body[close + 1] !== '(') return null;

  const hrefStart = close + 2;
  let hrefEnd = -1;
  for (let j = hrefStart; j < body.length; j++) {
    const ch = body[j];
    if (ch === '\n') return null;
    if (ch === ')') {
      hrefEnd = j;
      break;
    }
  }
  if (hrefEnd === -1) return null;

  const text = body.slice(i + 1, close);
  const rawHref = body.slice(hrefStart, hrefEnd);
  const safeHref = sanitiseHref(rawHref);
  if (text.length === 0 || safeHref === null) return null;

  return {
    node: {
      kind: 'link',
      text,
      href: safeHref,
      external: isExternalHref(safeHref, siteHost),
    },
    consumed: hrefEnd + 1 - i,
  };
}

function tryDelimiter(
  body: string,
  i: number,
  marker: string,
  kind: 'bold' | 'em'
): InlineMatch | null {
  if (!body.startsWith(marker, i)) return null;
  const contentStart = i + marker.length;
  let close = -1;
  for (let j = contentStart; j < body.length; j++) {
    if (body[j] === '\n') return null;
    if (body.startsWith(marker, j)) {
      // Reject the asterisk/underscore case where `*` or `_` is part of
      // a larger delimiter (`**` / `__`) we already handle elsewhere.
      if (marker.length === 1 && body[j + 1] === marker) continue;
      close = j;
      break;
    }
  }
  if (close === -1 || close === contentStart) return null;
  const value = body.slice(contentStart, close);
  return {
    node: { kind, value },
    consumed: close + marker.length - i,
  };
}

/**
 * Parse an admin-authored chat message body into an inline node list.
 * Supports:
 *   - Bold: `**text**` or `__text__`
 *   - Emphasis: `*text*` or `_text_`
 *   - Links: `[label](href)` — only http(s), mailto, or relative paths
 *
 * Anything that doesn't match a supported pattern is emitted as plain
 * text, preserving the original characters (so `**` inside arithmetic
 * or `_under_score_` style identifiers degrade gracefully).
 *
 * Bold/em are not nested — the parser greedily matches the longest
 * surrounding pair and treats the body as a flat string. Mentions
 * inside `value`/`text` are preserved verbatim so the renderer can
 * re-tokenise them on top of the formatting.
 */
export function parseAdminMarkdown(body: string, options: ParseOptions = {}): AdminMarkdownNode[] {
  const nodes: AdminMarkdownNode[] = [];
  let buffer = '';
  let i = 0;

  const flushBuffer = (): void => {
    if (buffer.length > 0) {
      nodes.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  while (i < body.length) {
    const match =
      tryLink(body, i, options.siteHost) ??
      tryDelimiter(body, i, '**', 'bold') ??
      tryDelimiter(body, i, '__', 'bold') ??
      tryDelimiter(body, i, '*', 'em') ??
      tryDelimiter(body, i, '_', 'em');

    if (match) {
      flushBuffer();
      nodes.push(match.node);
      i += match.consumed;
      continue;
    }

    buffer += body[i];
    i += 1;
  }

  flushBuffer();
  return nodes;
}
