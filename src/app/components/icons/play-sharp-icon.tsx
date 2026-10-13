/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactElement, SVGProps } from 'react';

interface PlaySharpIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * A play triangle with pointed corners, drawn as a single filled polygon on
 * the lucide 24-unit grid.
 *
 * lucide's `Play` bakes 2-unit arcs into its path, so no `stroke-linejoin`
 * setting can sharpen it; the zine stamp wants hard edges, so this draws the
 * glyph itself. It fills with `currentColor` and carries no stroke, so the
 * only visible shape is the triangle's crisp outline.
 */
export const PlaySharpIcon = ({
  size = 24,
  className,
  ...props
}: PlaySharpIconProps): ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    stroke="none"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <polygon points="6 3 20 12 6 21" />
  </svg>
);
