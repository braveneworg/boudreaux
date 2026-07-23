/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { loggers } from '@/lib/utils/logger';

const logger = loggers.s3;

/** A PEM private-key header, in any of the labels CloudFront keys ship with. */
const PEM_PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

/**
 * Normalize an env-provided PEM: turn escaped `\n` sequences (a common result
 * of pasting a multi-line key into a single-line env var) back into real
 * newlines, and trim surrounding whitespace. A properly base64-encoded PEM
 * already decodes to real newlines, so this is a no-op for the happy path.
 */
const normalizePem = (pem: string): string => pem.replace(/\\n/g, '\n').trim();

/**
 * Resolve `CLOUDFRONT_PRIVATE_KEY_BASE64` to a usable PEM, shared by the stream
 * and download signing paths.
 *
 * The value is meant to be base64-of-PEM, but the two most common corruptions
 * are pasting the PEM itself (not its base64) or pasting it with escaped
 * newlines. Both are accepted: a value that already looks like a PEM is used
 * directly, otherwise it is base64-decoded, and the result is validated to
 * actually be a PEM private key.
 *
 * Returns `null` — never throws — when the value resolves to something that is
 * not a PEM, logging a diagnostic that names the misconfiguration using only
 * safe facts (lengths and a boolean, NEVER key bytes). Without this the failure
 * surfaces only as an opaque OpenSSL `DECODER routines::unsupported` error
 * thrown from the signer on every request, indistinguishable from a transient
 * signing fault.
 *
 * @param rawEnvValue - The raw `CLOUDFRONT_PRIVATE_KEY_BASE64` value.
 * @returns The PEM private key, or `null` when the value cannot be resolved.
 */
export const resolveCloudfrontPrivateKey = (rawEnvValue: string): string | null => {
  const trimmed = rawEnvValue.trim();
  if (PEM_PRIVATE_KEY_HEADER.test(trimmed)) {
    return normalizePem(trimmed);
  }

  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  if (PEM_PRIVATE_KEY_HEADER.test(decoded)) {
    return normalizePem(decoded);
  }

  logger.error(
    'CLOUDFRONT_PRIVATE_KEY_BASE64 is set but did not resolve to a PEM private key — ' +
      'expected base64 of a PEM (or a PEM directly). Likely double-encoded, truncated, ' +
      'or the wrong value.',
    {
      rawLength: trimmed.length,
      decodedLength: decoded.length,
      decodedStartsWithDashes: decoded.trimStart().startsWith('-----'),
    }
  );
  return null;
};
