/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createPrivateKey } from 'node:crypto';

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

/** Pick the candidate PEM: a value that is already a PEM, else its base64 decode. */
const pemCandidate = (trimmed: string, decoded: string): string | null => {
  if (PEM_PRIVATE_KEY_HEADER.test(trimmed)) return normalizePem(trimmed);
  if (PEM_PRIVATE_KEY_HEADER.test(decoded)) return normalizePem(decoded);
  return null;
};

/**
 * Resolve `CLOUDFRONT_PRIVATE_KEY_BASE64` to a usable PEM, shared by the stream
 * and download signing paths.
 *
 * The value is meant to be base64-of-PEM, but the two most common corruptions
 * are pasting the PEM itself (not its base64) or pasting it with escaped
 * newlines. Both are accepted: a value that already looks like a PEM is used
 * directly, otherwise it is base64-decoded. The result is then *parsed* with
 * `createPrivateKey`, because a PEM header alone is not enough — a truncated or
 * corrupted body (e.g. a raw multi-line key mangled to just its header when
 * written to an env file) passes the shape check and then throws an opaque
 * OpenSSL `DECODER routines::unsupported` at sign time, on every request.
 *
 * Returns `null` — never throws — when the value is not a PEM or does not parse
 * as a private key, logging a diagnostic that names the misconfiguration using
 * only safe facts (lengths, a boolean, and the crypto error text — NEVER key
 * bytes) so a bad secret is diagnosable rather than a silent per-request fault.
 *
 * @param rawEnvValue - The raw `CLOUDFRONT_PRIVATE_KEY_BASE64` value.
 * @returns The PEM private key, or `null` when the value cannot be resolved.
 */
export const resolveCloudfrontPrivateKey = (rawEnvValue: string): string | null => {
  const trimmed = rawEnvValue.trim();
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');

  const candidate = pemCandidate(trimmed, decoded);
  if (candidate === null) {
    logger.error(
      'CLOUDFRONT_PRIVATE_KEY_BASE64 is set but did not resolve to a PEM private key — ' +
        'expected base64 of a PEM (or a PEM directly). Likely double-encoded, truncated, ' +
        'or the wrong value.',
      // No underlying error here; the diagnostic facts ride the third (data)
      // argument. Passing them as the second arg would String()-coerce the
      // object to "[object Object]" and drop every field.
      undefined,
      {
        rawLength: trimmed.length,
        decodedLength: decoded.length,
        decodedStartsWithDashes: decoded.trimStart().startsWith('-----'),
      }
    );
    return null;
  }

  try {
    createPrivateKey(candidate);
  } catch (err) {
    logger.error(
      'CLOUDFRONT_PRIVATE_KEY_BASE64 has a PEM header but its body is not a parseable ' +
        'private key — likely truncated or corrupted (a header-only value is ~28 chars, ' +
        'a full RSA-2048 key ~1700).',
      // The crypto error rides the second (error) argument so the Logger
      // extracts its message/stack; candidateLength rides the third (data) arg.
      err,
      { candidateLength: candidate.length }
    );
    return null;
  }

  return candidate;
};
