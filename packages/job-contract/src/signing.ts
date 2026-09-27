/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC signing of the async-job callbacks (ADR-0014). The web app derives a
 * per-job key from an app-only secret at dispatch and hands it to the Lambda
 * inside the (IAM-authenticated) invoke payload; the Lambda signs every
 * callback and progress POST with it; the app re-derives the key from the
 * secret and the stored job token and verifies before trusting the body. The
 * key is never stored, so a leaked job token (#787) no longer lets anyone
 * forge a callback.
 *
 * Server-only: this module reaches `node:crypto`, so it is exported through
 * the `@fakefour/job-contract/signing` subpath and never from the package
 * root, which client bundles may import for its zod schemas.
 */

/** The request header that carries a callback's signature. */
export const JOB_SIGNATURE_HEADER = 'x-job-signature';

/** How far a signature's timestamp may sit from the verifier's clock, either side. */
export const JOB_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** The async jobs the bio-generator Lambda runs; part of the key derivation input. */
export type JobKind = 'bio-generation' | 'image-links' | 'video-enrichment';

/** The identity a per-job signing key is derived from. */
export interface JobSigningIdentity {
  kind: JobKind;
  /** The artist or video id the job belongs to. */
  entityId: string;
  /** The per-job bearer token stored on the entity row. */
  jobToken: string;
}

/** Why a signature was rejected. */
export type JobSignatureFailure = 'missing' | 'malformed' | 'stale' | 'mismatch';

/** The outcome of {@link verifyJobSignature}. */
export type JobSignatureVerdict = { ok: true } | { ok: false; reason: JobSignatureFailure };

const HEX_DIGEST = /^[0-9a-f]+$/;
const SHA256_HEX_LENGTH = 64;

const hmacHex = (key: string, message: string): string =>
  createHmac('sha256', key).update(message).digest('hex');

/**
 * Derive the per-job signing key: `HMAC-SHA256(secret, "<kind>:<entityId>:<jobToken>")`
 * as lower-case hex. Deterministic, so the verifier recomputes it from the
 * stored token instead of storing the key.
 */
export const deriveJobSigningKey = (
  secret: string,
  { kind, entityId, jobToken }: JobSigningIdentity
): string => hmacHex(secret, `${kind}:${entityId}:${jobToken}`);

/**
 * Sign a request body: `t=<unix seconds>,v1=<hex HMAC-SHA256(key, "<t>.<rawBody>")>`.
 * `rawBody` must be the exact string that is sent — the verifier signs the
 * bytes it received, not a re-serialisation.
 */
export const signJobBody = (signingKey: string, rawBody: string, nowSeconds: number): string => {
  const t = Math.floor(nowSeconds);
  return `t=${t},v1=${hmacHex(signingKey, `${t}.${rawBody}`)}`;
};

/** Parse `t=…,v1=…` into its parts, or `null` when the header is not in that shape. */
const parseSignatureHeader = (header: string): { t: number; v1: string } | null => {
  const parts = new Map(
    header.split(',').map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return [name, rest.join('=')] as const;
    })
  );
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1');
  if (!Number.isInteger(t) || !v1 || !HEX_DIGEST.test(v1) || v1.length % 2 !== 0) {
    return null;
  }
  return { t, v1 };
};

/** What {@link verifyJobSignature} needs: the header, the raw body, the key, and a clock. */
export interface VerifyJobSignatureInput {
  /** The `x-job-signature` header value, or `null` when the request carries none. */
  header: string | null | undefined;
  /** The request body exactly as received. */
  rawBody: string;
  /** The key re-derived with {@link deriveJobSigningKey} from the stored token. */
  signingKey: string;
  /** The verifier's clock, in unix seconds. */
  nowSeconds: number;
  /** Replay window either side of `nowSeconds`; defaults to {@link JOB_SIGNATURE_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number;
}

/**
 * Verify a signed body. Checks shape, then freshness, then the digest in
 * constant time; never throws. The order means a stale-but-valid signature
 * reports `stale` rather than `mismatch`, which keeps the log reason honest.
 */
export const verifyJobSignature = ({
  header,
  rawBody,
  signingKey,
  nowSeconds,
  toleranceSeconds = JOB_SIGNATURE_TOLERANCE_SECONDS,
}: VerifyJobSignatureInput): JobSignatureVerdict => {
  if (!header) {
    return { ok: false, reason: 'missing' };
  }
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(Math.floor(nowSeconds) - parsed.t) > toleranceSeconds) {
    return { ok: false, reason: 'stale' };
  }
  const expected = Buffer.from(hmacHex(signingKey, `${parsed.t}.${rawBody}`), 'hex');
  const presented = Buffer.from(parsed.v1, 'hex');
  if (presented.length !== SHA256_HEX_LENGTH / 2 || !timingSafeEqual(expected, presented)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
};
