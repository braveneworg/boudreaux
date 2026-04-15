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

    // Modern event listener for media query changes
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    mediaQueryList.addEventListener('change', listener);

    // Clean up the listener on unmount
    return () => mediaQueryList.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
