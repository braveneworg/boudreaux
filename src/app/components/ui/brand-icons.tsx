/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Monochrome inline SVG brand icons for social auth providers.
 * All icons use `currentColor` fill so they adapt to any text colour,
 * and are marked `aria-hidden="true"` — the parent button provides
 * the accessible label.
 */

export interface BrandIconProps {
  className?: string;
}

export const AppleIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 814 1000"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    width="1em"
    height="1em"
  >
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 411.3 8.7 312.4 8.7 216.8c0-167.9 109.8-257.5 217.4-257.5 64.5 0 118.1 42.4 158.6 42.4 38.2 0 98.4-45 170.2-45 67.1 0 143.5 40.8 193.2 114.6ZM580.3 117.7c25-29.5 43.4-70.7 43.4-111.9 0-5.7-.5-11.5-1.5-16.5-41 1.5-90.8 27.4-120.3 57.8-22.8 24.1-44.8 65.8-44.8 107.6 0 6.2 1 12.3 1.5 14.3 2.5.5 6.5 1 10.5 1 37.5 0 84.5-25.3 111.2-52.3Z" />
  </svg>
);

export const GoogleIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    width="1em"
    height="1em"
  >
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
  </svg>
);

export const FacebookIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    width="1em"
    height="1em"
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export const XIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    width="1em"
    height="1em"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
