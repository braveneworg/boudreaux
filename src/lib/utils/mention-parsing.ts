/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Matches an `@username` mention. The username character class is
 * intentionally narrow — alphanumerics, underscore, hyphen, dot —
 * matching the conservative shape we allow when users pick a username.
 * Capped at 32 chars to bound parse cost on long pasted messages.
 *
 * The leading boundary requires either start-of-string or a
 * non-word/non-hyphen char so we don't pick up `email@example.com` or
 * `foo@bar` patterns as mentions.
 */
export const MENTION_REGEX = /(^|[^\w@-])@([A-Za-z0-9_.-]{1,32})/g;

/** Token kind emitted by {@link tokenizeMentions}. */
export type MentionToken =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string; username: string };

/**
 * Extract the unique usernames mentioned in a message body, preserving
 * insertion order. Returns lowercased forms — callers should compare
 * against `User.username.toLowerCase()` to be case-insensitive.
 */
export function extractMentionUsernames(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(MENTION_REGEX)) {
    const username = match[2]?.toLowerCase();
    if (!username || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
  }
  return out;
}

/**
 * Split a message body into text + mention tokens for rendering. Each
 * `@token` segment becomes a `mention` token regardless of whether the
 * username actually exists — the chat composer's autocomplete enforces
 * validity at compose time, and rendering every `@x` as styled lets the
 * UI stay schema-free.
 */
export function tokenizeMentions(body: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let cursor = 0;
  for (const match of body.matchAll(MENTION_REGEX)) {
    const start = match.index ?? 0;
    const prefix = match[1] ?? '';
    const mentionStart = start + prefix.length;
    if (mentionStart > cursor) {
      tokens.push({ kind: 'text', value: body.slice(cursor, mentionStart) });
    }
    const raw = match[0].slice(prefix.length); // includes the '@'
    const username = match[2] ?? '';
    tokens.push({ kind: 'mention', value: raw, username });
    cursor = mentionStart + raw.length;
  }
  if (cursor < body.length) {
    tokens.push({ kind: 'text', value: body.slice(cursor) });
  }
  return tokens;
}
