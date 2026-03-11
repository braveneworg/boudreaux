/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SVGProps } from 'react';

interface BandsintownIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Bandsintown logo mark as inline SVG.
 * Brand color: #08C3BA (teal)
 *
 * The Bandsintown icon represents their distinctive "heart + location pin" mark --
 * a location pin shape with a heart cutout, symbolizing the love of live music events.
 */
export const BandsintownIcon = ({ size = 20, className, ...props }: BandsintownIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Location pin with heart — Bandsintown brand mark */}
    <path
      d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7.13 11.38 7.43 11.63a.998.998 0 0 0 1.14 0C12.87 21.38 20 15.25 20 10c0-4.42-3.58-8-8-8zm0 11.5c-.28 0-.5-.07-.73-.18l-.04-.02-2.73-2.73a2.5 2.5 0 0 1 3.5-3.5 2.5 2.5 0 0 1 3.5 3.5l-2.73 2.73-.04.02c-.23.11-.45.18-.73.18z"
      fill="#08C3BA"
    />
  </svg>
);
