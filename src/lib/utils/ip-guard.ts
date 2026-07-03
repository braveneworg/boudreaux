/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Returns true when `b` falls within `[lo, hi]` inclusive (second-octet range checks).
const inRange = (b: number, lo: number, hi: number): boolean => b >= lo && b <= hi;

// Returns true when the second octet makes (a, b) land in a private /16 or /12 block.
const isPrivateSecondOctet = (a: number, b: number): boolean => {
  if (a === 169 && b === 254) return true;
  if (a === 172 && inRange(b, 16, 31)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && inRange(b, 64, 127)) return true;
  return false;
};

// Checks private/reserved IPv4 ranges for SSRF protection.
// 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 (CGNAT), 224/4+
const isDisallowedIPv4 = (address: string): boolean => {
  const parts = address.split('.').map((octet) => Number.parseInt(octet, 10));
  /* v8 ignore start -- defensive: isIP() already guarantees version 4 means exactly four numeric octets, so this guard is unreachable */
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  /* v8 ignore stop */
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  return isPrivateSecondOctet(a, b);
};

// Checks private/reserved IPv6 ranges for SSRF protection.
// loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7), IPv4-mapped private
const isDisallowedIPv6 = (lower: string): boolean => {
  if (lower === '::1' || lower === '::') return true;
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — check the tail with the IPv4 rules.
    return isDisallowedAddress(lower.slice('::ffff:'.length));
  }
  return false;
};

/**
 * Returns true for IPv4/IPv6 addresses in loopback, link-local, private, or
 * the AWS/GCP instance-metadata ranges. We block these before issuing the
 * fetch to stop SSRF pivoting to internal services.
 */
export const isDisallowedAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return isDisallowedIPv4(address);
  if (version === 6) return isDisallowedIPv6(address.toLowerCase());
  return true;
};

/**
 * True when the URL is http(s) and its hostname resolves to a publicly
 * routable address. Guards every server-side bio image re-host fetch against
 * SSRF into private ranges: enforced centrally inside the shared fetch helper
 * (`fetchImageBuffer` in bio-image-service), which covers both the
 * generation-time path (lambda-scraped URLs) and the save-time path
 * (admin-supplied URLs, which also pre-vet in `rehostOne` for specific
 * logging).
 */
export const isPubliclyRoutableUrl = async (url: string): Promise<boolean> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  try {
    const { address } = await lookup(parsed.hostname);
    return !isDisallowedAddress(address);
  } catch {
    return false;
  }
};
