/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash } from 'crypto';

/**
 * Computes the Gravatar MD5 hash for an email address per Gravatar's
 * documented algorithm: lowercase, trim, MD5, lowercase hex digest.
 *
 * Computed server-side so peer emails are never broadcast over realtime
 * channels — only the public-by-design hash is exposed to other users.
 */
export const gravatarHash = (email: string): string =>
  createHash('md5').update(email.trim().toLowerCase()).digest('hex');
