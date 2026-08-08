/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

/**
 * Computes the Gravatar SHA-256 hash of an email address client-side via
 * Web Crypto, per Gravatar's documented algorithm: trim, lowercase,
 * SHA-256, lowercase hex digest.
 *
 * Returns an empty string until the digest resolves (Web Crypto is async)
 * and when no email is given. Server code uses the synchronous
 * `gravatarHash` util in `@/lib/utils/gravatar-hash` instead.
 */
export const useGravatarHash = (email?: string): string => {
  const [hash, setHash] = useState('');

  useEffect(() => {
    if (!email) {
      setHash('');
      return;
    }

    let cancelled = false;
    const compute = async (): Promise<void> => {
      try {
        const bytes = new TextEncoder().encode(email.trim().toLowerCase());
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        if (cancelled) {
          return;
        }
        const hex = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        setHash(hex);
      } catch {
        // Web Crypto is unavailable outside secure contexts; leave the hash
        // empty so consumers fall back to initials.
      }
    };
    void compute();

    return () => {
      cancelled = true;
    };
  }, [email]);

  return hash;
};
