/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { cn } from '@/lib/utils/tailwind-utils';

/**
 * Monochrome inline SVG brand icons for social auth providers.
 * All icons use `currentColor` fill so they adapt to any text colour,
 * and are marked `aria-hidden="true"` — the parent button provides
 * the accessible label.
 *
 * Each icon defaults to a square `size-4 shrink-0` box and relies on the
 * SVG `viewBox` (preserved aspect ratio) rather than fixed `width`/`height`
 * attributes — so a non-square glyph like Apple's letterboxes cleanly instead
 * of stretching or bleeding past its button. Pass a `size-*` class to override.
 */

export interface BrandIconProps {
  className?: string;
}

export const AppleIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={cn('size-4 shrink-0', className)}
  >
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.04.28.04.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.793 0-2.32.91-3.71.91-1.473 0-2.54-1.27-3.514-2.61-1.6-2.23-2.91-5.64-2.91-8.86 0-5.17 3.37-7.91 6.68-7.91 1.46 0 2.71.93 3.66.93.91 0 2.27-.99 3.95-.99.63 0 2.85.06 4.31 2.18-.11.07-2.54 1.49-2.54 4.45 0 3.42 3.01 4.62 3.1 4.65z" />
  </svg>
);

export const GoogleIcon = ({ className }: BrandIconProps): React.ReactElement => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={cn('size-4 shrink-0', className)}
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
    className={cn('size-4 shrink-0', className)}
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
    className={cn('size-4 shrink-0', className)}
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
