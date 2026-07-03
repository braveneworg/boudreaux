/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { Expand } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ExpandableThumbnailProps {
  src: string;
  thumbnailSrc?: string | null;
  alt: string;
  caption?: string | null;
  attribution?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
  className?: string;
}

interface ThumbnailCaptionProps {
  caption?: string | null;
  attribution?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
}

/**
 * Optional figcaption for the expanded image: caption, attribution, license, and
 * a "source" link, separated by middots. Renders nothing when no metadata is set.
 */
const ThumbnailCaption = ({ caption, attribution, license, sourceUrl }: ThumbnailCaptionProps) => {
  if (!caption && !attribution && !license) return null;
  return (
    <figcaption className="text-muted-foreground text-xs">
      {caption && <span className="text-foreground block font-medium">{caption}</span>}
      {attribution && <span>{attribution}</span>}
      {license && (
        <span>
          {attribution ? ' · ' : ''}
          {license}
        </span>
      )}
      {sourceUrl && (
        <>
          {' · '}
          <a
            href={sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="hover:text-foreground underline"
          >
            source
          </a>
        </>
      )}
    </figcaption>
  );
};

/**
 * A bio image thumbnail that expands to a full-size view. On desktop the
 * thumbnail scales up on hover; on any device, tapping/clicking opens a dialog
 * with the full image. Mobile-first.
 *
 * Bio images are re-hosted on our CDN with `_w{width}` variants, so they render
 * through the custom next/image loader (no `unoptimized`).
 */
export const ExpandableThumbnail = ({
  src,
  thumbnailSrc,
  alt,
  caption,
  attribution,
  license,
  sourceUrl,
  className,
}: ExpandableThumbnailProps) => (
  <Dialog>
    <DialogTrigger asChild>
      <button
        type="button"
        aria-label={`Expand image: ${alt}`}
        className={cn(
          'group relative block overflow-hidden border-2 border-black',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
          className
        )}
      >
        <Image
          src={thumbnailSrc ?? src}
          alt={alt}
          width={240}
          height={240}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <Expand
            className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
      </button>
    </DialogTrigger>
    <DialogContent className="max-w-3xl">
      <DialogTitle className="sr-only">{alt}</DialogTitle>
      <DialogDescription className="sr-only">{caption ?? alt}</DialogDescription>
      <div className="space-y-3">
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={900}
          className="h-auto w-full object-contain"
        />
        <ThumbnailCaption
          caption={caption}
          attribution={attribution}
          license={license}
          sourceUrl={sourceUrl}
        />
      </div>
    </DialogContent>
  </Dialog>
);
