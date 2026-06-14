/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { createHash } from 'node:crypto';

/**
 * Server-side visitor fingerprint hash (007-free-digital-downloads).
 *
 * Inputs are deliberately coarse so the hash is **stable** for the same
 * visitor across a session even when their public IP rotates within the same
 * /24 (IPv4) or /64 (IPv6) prefix — typical of mobile carriers and most
 * residential ISPs.
 *
 * The full client IP is **never** stored. Only the truncated network prefix
 * is fed into the SHA-256, and even that prefix is hashed before it touches
 * any persistent store, satisfying data-minimization for the per-release cap.
 */

export interface FingerprintInput {
  userAgent: string | null | undefined;
  acceptLanguage: string | null | undefined;
  ip: string | null | undefined;
}

/**
 * Truncate an IPv4 address to its /24 prefix (first 3 octets) or an IPv6
 * address to its /64 prefix (first 4 hextets). Returns the empty string when
 * the input cannot be interpreted as IPv4/IPv4-mapped-IPv6/IPv6.
 */
export function truncateIp(ip: string | null | undefined): string {
  if (!ip) return '';
  const trimmed = ip.trim();
  if (!trimmed) return '';

  // IPv4 (covers IPv4-mapped IPv6 like ::ffff:1.2.3.4 by stripping the prefix)
  const v4Candidate = trimmed.replace(/^::ffff:/i, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4Candidate)) {
    const octets = v4Candidate.split('.');
    if (octets.every((o) => Number(o) >= 0 && Number(o) <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
  }

  // IPv6 — take first 4 hextets, expand `::` once if present.
  if (trimmed.includes(':')) {
    const [head, tail] = trimmed.split('::', 2);
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    const expanded =
      missing >= 0
        ? [...headParts, ...new Array(missing).fill('0'), ...tailParts]
        : trimmed.split(':');
    const prefix = expanded.slice(0, 4).map((h) => (h ? h.toLowerCase() : '0'));
    return `${prefix.join(':')}::/64`;
  }

  return '';
}

/**
 * Computes the deterministic SHA-256 fingerprint hash for an anonymous
 * visitor. Returns a 64-character lowercase hex digest.
 */
export function computeFingerprintHash(input: FingerprintInput): string {
  const ua = (input.userAgent ?? '').trim();
  const lang = (input.acceptLanguage ?? '').trim();
  const ipPrefix = truncateIp(input.ip);

  return createHash('sha256').update(`${ua}|${lang}|${ipPrefix}`).digest('hex');
}
