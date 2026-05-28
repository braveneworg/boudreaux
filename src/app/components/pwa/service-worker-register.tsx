/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

// Registers the PWA service worker after the page is interactive. Rendered once
// in the root layout. Registration is skipped in development so the SW cache
// never interferes with hot reloading, and in E2E builds where the SW's
// network-first navigation cache makes mutation→reload flows nondeterministic.
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
      return;
    }

    if (!('serviceWorker' in navigator)) {
      return;
    }

    const register = (): void => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    globalThis.addEventListener('load', register);
    return () => globalThis.removeEventListener('load', register);
  }, []);

  return null;
}
