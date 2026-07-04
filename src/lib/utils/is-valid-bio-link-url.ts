/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether `value` is a valid bio link URL target: an absolute http(s) URL
 * or a site-relative path starting with `/` (but not protocol-relative `//`).
 *
 * Rejects `javascript:`, `data:`, protocol-relative `//`, and empty values.
 * Semantics match the `bioStatusLinkUrlSchema` Zod refine rule so the same
 * guard is active at parse-time, dialog-time, and drag-time.
 *
 * @param href - The candidate URL or path string.
 * @returns `true` only for acceptable bio link targets.
 */
export const isValidBioLinkUrl = (href: string): boolean =>
  /^https?:\/\//.test(href) || (href.startsWith('/') && !href.startsWith('//'));
