/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import { cn } from '@/lib/utils/tailwind-utils';

import { Heading } from './heading';
import { ZineSketchStrokes } from './zine-sketch-strokes';

import type { HeadingProps } from './heading';

export interface ImageHeadingProps extends Omit<HeadingProps, 'children'> {
  /** CDN-relative or absolute path to the heading image (without the `_w{n}` suffix). */
  src: string;
  /** Image alt text — serves as the heading's accessible name (announced by assistive tech) and as crawlable SEO text. */
  alt: string;
  /** Intrinsic image width in pixels. Defaults to 1920 (the largest variant). */
  imageWidth?: number;
  /** Intrinsic image height in pixels. Required to preserve aspect ratio / prevent CLS. */
  imageHeight: number;
  /** Optional className applied to the `<img>` element. */
  imageClassName?: string;
  /** Whether to mark the image as a high-priority LCP candidate. */
  priority?: boolean;
  /**
   * Browser loading strategy for the image. `eager` starts the fetch at render
   * instead of on viewport intersection — the middle ground for headings that
   * aren't the LCP (no `priority` preload) but shouldn't linger as an empty
   * sketch-stroke frame while a lazy fetch waits. Omit for next/image's
   * default (lazy unless `priority`).
   */
  loading?: 'eager' | 'lazy';
  /** Whether to trace the wordmark with the hand-drawn zine sketch strokes. Defaults to on. */
  sketched?: boolean;
}

/**
 * A heading whose visible content is an image (e.g. a stylized wordmark).
 * The `alt` text serves as the heading's accessible name (announced once by
 * assistive technologies) and as crawlable SEO text. The wordmark renders
 * height-driven at the shared ZineHeading strip scale (`h-12`/`sm:h-14`,
 * width from the aspect ratio) so page headers stay a consistent size
 * site-wide; the static `sizes` hint matches that fixed rendering so the
 * CDN loader serves the smallest useful variant.
 */
const ImageHeading = ({
  src,
  alt,
  imageWidth = 1920,
  imageHeight,
  className,
  imageClassName,
  level = 1,
  priority = false,
  loading,
  sketched = true,
  ...headingProps
}: ImageHeadingProps) => {
  const image = (
    <Image
      src={src}
      alt={alt}
      width={imageWidth}
      height={imageHeight}
      sizes="(min-width: 640px) 224px, 100vw"
      priority={priority}
      loading={loading}
      className={cn('h-auto w-full sm:h-14 sm:w-auto', imageClassName)}
    />
  );

  return (
    <Heading level={level} className={cn('mt-1 mb-1.5 h-auto', className)} {...headingProps}>
      {sketched ? (
        // The strokes anchor to an inline-block wrapper hugging the image
        // box — the heading element itself spans the full content width.
        <span className="relative inline-block w-full sm:w-auto">
          <ZineSketchStrokes />
          {image}
        </span>
      ) : (
        image
      )}
    </Heading>
  );
};

export { ImageHeading };
