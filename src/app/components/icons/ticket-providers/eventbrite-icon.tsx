/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SVGProps } from 'react';

interface EventbriteIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Eventbrite logo mark as inline SVG.
 * Brand color: #F05537 (orange)
 *
 * Simplified representation of the Eventbrite "E" mark.
 */
export const EventbriteIcon = ({ size = 20, className, ...props }: EventbriteIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stylized "e" shape — Eventbrite brand mark */}
    <path
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.5 11.5h-7a3.5 3.5 0 0 0 6.65 1.5h1.85a5.5 5.5 0 1 1 0-6h-1.85a3.5 3.5 0 0 0-6.65 1.5h7v3z"
      fill="#F05537"
    />
  </svg>
);
