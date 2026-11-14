/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import { submissionCategoryShortLabel } from '@/lib/constants/submissions';
import type { SubmissionCategory } from '@/lib/constants/submissions';
import { cn } from '@/lib/utils';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

/** The edge of the picture in a list row, in pixels. */
const SIZE = 56;

export interface SubmissionCardPictureProps {
  /** The card picture's address for this reader, when the submission has one. */
  url: string | undefined;
  category: SubmissionCategory;
  className?: string;
}

/**
 * A submission's card picture (CONTEXT.md): its first image, else a frame of
 * its first video, else a tile naming its category. Decoration beside a title
 * that already names the submission, so it has no text of its own to read.
 */
export const SubmissionCardPicture = ({ url, category, className }: SubmissionCardPictureProps) => (
  <div
    className={cn(
      'border-foreground bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden border-2',
      className
    )}
  >
    {url === undefined ? (
      <span className="px-1 text-center text-xs leading-tight font-semibold">
        {submissionCategoryShortLabel(category)}
      </span>
    ) : (
      <Image
        {...resolveCdnImageSource(url)}
        alt=""
        width={SIZE}
        height={SIZE}
        className="size-full object-cover"
      />
    )}
  </div>
);
