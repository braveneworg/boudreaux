/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { lookup } from 'node:dns/promises';

import { Agent } from 'undici';

import { isDisallowedAddress } from '@/lib/utils/ip-guard';

import type { LookupAddress, LookupOptions } from 'node:dns';

/** A DNS result that has already passed the SSRF blocklist. */
export type VettedAddress = { address: string; family: number };

type VetResult =
  | ({ ok: true } & VettedAddress)
  | { ok: false; reason: 'disallowed'; address: string }
  | { ok: false; reason: 'dns_failure'; error: unknown };

/**
 * DNS-resolves `hostname` and vets the result against the SSRF blocklist
 * (`isDisallowedAddress`). Never returns a framework Response and never logs —
 * callers map the outcome to their own error and own their telemetry, so the
 * failure shapes carry the forensic data the caller needs to log:
 * - lookup throws          → { ok: false, reason: 'dns_failure', error }
 * - resolves to a blocked IP → { ok: false, reason: 'disallowed', address }
 * - otherwise              → { ok: true, address, family }
 */
export const vetHostname = async (hostname: string): Promise<VetResult> => {
  try {
    const { address, family } = await lookup(hostname);
    if (isDisallowedAddress(address)) {
      return { ok: false, reason: 'disallowed', address };
    }
    return { ok: true, address, family };
  } catch (error) {
    return { ok: false, reason: 'dns_failure', error };
  }
};

/**
 * Builds an undici Agent whose DNS lookup is pinned to the already-vetted
 * address/family pair, closing the DNS-rebinding window that node's global
 * fetch would otherwise leave open between validation and socket connect.
 * TLS SNI still uses the original hostname so certificate validation is
 * unaffected. (M2)
 */
export const buildPinnedDispatcher = (address: string, family: number): Agent => {
  const pinnedLookup = (
    _hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      resolved: string | LookupAddress[],
      resolvedFamily?: number
    ) => void
  ): void => {
    if (options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
  return new Agent({ connect: { lookup: pinnedLookup } });
};
