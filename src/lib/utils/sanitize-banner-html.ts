/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['strong', 'em', 'a'],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    a: ['http', 'https'],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  allowedSchemesAppliedToAttributes: ['href'],
};

/**
 * Authoritative server-side sanitizer for banner notification HTML.
 *
 * Uses sanitize-html (a proper parser, not regex) so that malformed input
 * — missing closing `>`, mixed-case tag tricks, exotic whitespace — cannot
 * smuggle attributes or tags past the allowlist. This is the value that
 * gets persisted to the database; the client-side regex sanitizer in
 * `banner-notification-schema.ts` runs only on the admin preview before
 * submission and is a defense-in-depth layer, not the source of truth.
 */
export function sanitizeBannerHtmlServer(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}
