/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState, useEffect } from 'react';

/**
 * Hook that returns true if the media query matches.
 */
export function useMediaQuery(query: string): boolean {
  // Initialize with the current match state
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQueryList = window.matchMedia(query);

    // Synchronize immediately so a query change is reflected before the next event fires
    setMatches(mediaQueryList.matches);

    // Modern event listener for media query changes
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    mediaQueryList.addEventListener('change', listener);

    // Clean up the listener on unmount
    return () => mediaQueryList.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
