/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useState } from 'react';

import FingerprintJS from '@fingerprintjs/fingerprintjs';

interface UseFingerprintResult {
  fingerprint: string | null;
  isReady: boolean;
}

let agentPromise: Promise<{ get: () => Promise<{ visitorId: string }> }> | null = null;

const loadAgent = () => {
  if (!agentPromise) {
    agentPromise = FingerprintJS.load();
  }
  return agentPromise;
};

/**
 * Lazily load the FingerprintJS agent and return the visitor id. The
 * agent + visitor id are cached at module scope so the (~50KB) library
 * loads at most once per tab and resolves immediately on re-mount.
 *
 * Returns `{ fingerprint: null, isReady: false }` until resolution; the
 * caller should block sends or surface a "preparing…" state.
 */
export const useFingerprint = (): UseFingerprintResult => {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAgent()
      .then((agent) => agent.get())
      .then((result) => {
        if (!cancelled) setFingerprint(result.visitorId);
      })
      .catch((error: unknown) => {
        console.error('FingerprintJS failed to resolve a visitor id', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { fingerprint, isReady: fingerprint !== null };
};

/** Reset the cached agent — testing aid only. */
export const resetFingerprintAgentForTesting = (): void => {
  agentPromise = null;
};
