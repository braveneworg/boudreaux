/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SVGProps } from 'react';

interface TicketmasterIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Ticketmaster logo mark as inline SVG.
 * Brand color: #026CDF (blue)
 *
 * Simplified star/diamond mark representing Ticketmaster.
 */
export const TicketmasterIcon = ({ size = 20, className, ...props }: TicketmasterIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Star/diamond shape — Ticketmaster brand mark */}
    <path
      d="M12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"
      fill="#026CDF"
    />
  </svg>
);
