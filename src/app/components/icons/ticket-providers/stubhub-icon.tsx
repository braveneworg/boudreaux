/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SVGProps } from 'react';

interface StubhubIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * StubHub logo mark as inline SVG.
 * Brand color: #3F1D74 (purple)
 *
 * Simplified ticket-shaped mark representing StubHub.
 */
export const StubhubIcon = ({ size = 20, className, ...props }: StubhubIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Ticket shape — StubHub brand mark */}
    <path
      d="M22 10V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4zm-7-1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-6 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6.35-.15-6.5-6.5 1.06-1.06 6.5 6.5-1.06 1.06z"
      fill="#3F1D74"
    />
  </svg>
);
