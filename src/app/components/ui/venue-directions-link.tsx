/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';
import type { ReactNode } from 'react';

interface VenueDirectionsLinkProps {
  destination: string;
  children: ReactNode;
  className?: string;
}

/**
 * Platform-aware directions link that opens Apple Maps on iOS/iPadOS
 * and Google Maps on Android and desktop browsers.
 */
export const VenueDirectionsLink = ({
  destination,
  children,
  className,
}: VenueDirectionsLinkProps) => {
  const getDirectionsUrl = useCallback(() => {
    const encoded = encodeURIComponent(destination);
    const ua = navigator.userAgent;

    // iOS / iPadOS (includes iPhone, iPad, and iPod)
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
    }

    // Android — Google Maps handles this URL via intent on all versions
    // down to early KitKat, covering devices like the Galaxy S8+.
    if (/Android/i.test(ua)) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    }

    // macOS Safari may also support Apple Maps, but for desktop
    // browsers Google Maps provides a better web experience.
    return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  }, [destination]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.open(getDirectionsUrl(), '_blank', 'noopener,noreferrer');
  };

  // Default href for SSR / no-JS — Google Maps works everywhere as a fallback.
  const fallbackHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  return (
    <a
      href={fallbackHref}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
};
