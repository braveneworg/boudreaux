/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * The per-job HMAC key the web app derives at dispatch and passes in the
 * invoke payload (ADR-0014): a lower-case hex SHA-256 digest. Kept apart from
 * `./signing` so the input schemas stay free of `node:crypto`.
 */
export const jobSigningKey = z.string().regex(/^[0-9a-f]{64}$/, 'Expected a 64-char hex key');
