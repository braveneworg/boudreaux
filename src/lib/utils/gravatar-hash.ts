/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash } from 'crypto';

/**
 * Computes the Gravatar SHA-256 hash for an email address per Gravatar's
 * documented algorithm: trim, lowercase, SHA-256, lowercase hex digest.
 * Gravatar serves the same avatar for the MD5 and SHA-256 hash of an
 * address, so hashes persisted before the MD5 → SHA-256 switch stay valid.
 *
 * Computed server-side so peer emails are never broadcast over realtime
 * channels — only the public-by-design hash is exposed to other users.
 * Client components use the `useGravatarHash` hook instead.
 */
export const gravatarHash = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
