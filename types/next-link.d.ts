/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The App Router `next/link` runtime supports `unstable_dynamicOnHover`
 * (documented in Next's own `dist/client/app-dir/link.d.ts`), but the
 * published `next/link` types re-export the pages-router-flavored
 * `LinkProps`, which omits it. This augmentation declares the prop so nav
 * links can upgrade dynamic routes to a full prefetch on hover/touchstart.
 * Delete this file once the prop lands in the public `LinkProps` upstream.
 */
import type {} from 'next/link';

declare module 'next/link' {
  interface LinkProps<RouteInferType> {
    /**
     * (unstable) Switch to a full prefetch on hover. Effectively the same as
     * updating the `prefetch` prop to `true` in a mouse event.
     */
    unstable_dynamicOnHover?: boolean;
  }
}
