/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/lib/utils/tailwind-utils';

import { Heading } from './heading';

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
}

/**
 * A heading whose visible content is an image (e.g. a stylized wordmark).
 * The `alt` text serves as the heading's accessible name (announced once by
 * assistive technologies) and as crawlable SEO text. Pairs with the project's
 * CDN image loader so all seven width variants (`_w256`–`_w1200`) participate
 * in the generated srcset.
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
  ...headingProps
}: ImageHeadingProps) => {
  const isMobile = useIsMobile();

  return (
    <Heading level={level} className={cn('mt-1 mb-1.5 h-auto', className)} {...headingProps}>
      <Image
        src={src}
        alt={alt}
        width={imageWidth}
        height={imageHeight}
        sizes={isMobile ? '(min-width: 380px) 380px, 100vw' : '(min-width: 600px) 600px, 100dvw'}
        priority={priority}
        className={cn(
          'h-auto',
          { 'w-full': isMobile, 'max-w-480': isMobile, 'w-auto': !isMobile },
          imageClassName
        )}
      />
    </Heading>
  );
};

export { ImageHeading };
