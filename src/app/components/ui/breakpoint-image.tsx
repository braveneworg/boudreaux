/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentProps, ReactElement } from 'react';

import Image from 'next/image';

/**
 * A 1×1 transparent GIF. The candidate a hidden breakpoint resolves to: the
 * browser "loads" it from the data URI and makes no network request.
 */
export const BLANK_IMAGE_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

interface BreakpointImageProps extends ComponentProps<typeof Image> {
  /**
   * The media query of the breakpoint where CSS hides this image. A
   * `display: none` `<img>` is still fetched — eagerly and at whatever
   * priority its hints ask for — so a treatment rendered for every viewport
   * and hidden by CSS on some of them costs its downloads everywhere.
   */
  hiddenMedia: string;
}

/**
 * A `next/image` whose fetch is skipped on the breakpoint that hides it.
 *
 * Wraps the image in a `<picture>` whose first `<source>` matches
 * `hiddenMedia` and serves {@link BLANK_IMAGE_DATA_URI}; elsewhere the
 * browser falls through to the image's own `srcset`/`sizes`, so the variant
 * it picks (and any media-scoped preload for it) is unchanged. The picture is
 * `display: contents`, so a `fill` image still sizes to the nearest positioned
 * ancestor exactly as before.
 */
export const BreakpointImage = ({
  hiddenMedia,
  ...imageProps
}: BreakpointImageProps): ReactElement => (
  <picture className="contents">
    <source media={hiddenMedia} srcSet={BLANK_IMAGE_DATA_URI} />
    <Image {...imageProps} />
  </picture>
);
