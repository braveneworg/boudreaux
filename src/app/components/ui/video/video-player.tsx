/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Film, Play } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';

import { LazyVideoSurface } from './lazy-video-surface';

export interface VideoPlayerProps {
  title: string;
  /** Callers pass resolveStreamUrl(video), which may be null. */
  src: string | null;
  posterUrl?: string | null;
  className?: string;
}

/**
 * A lightweight poster facade that loads ZERO video.js code until the user
 * presses play. On activation it swaps in the lazily-imported video.js surface.
 * Safe to render many times in an infinite list (admin cards, /videos feed).
 */
export const VideoPlayer = ({
  title,
  src,
  posterUrl,
  className,
}: VideoPlayerProps): ReactElement => {
  const [activated, setActivated] = useState(false);

  if (activated && src) {
    return <LazyVideoSurface title={title} src={src} posterUrl={posterUrl} />;
  }

  return (
    <div
      className={cn(
        'bg-muted relative aspect-video w-full overflow-hidden border-2 border-black',
        className
      )}
    >
      {posterUrl ? (
        <Image src={posterUrl} alt={title} fill unoptimized className="object-cover" />
      ) : (
        <div className="text-muted-foreground flex size-full items-center justify-center">
          <Film className="size-10" aria-hidden />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <Button
          type="button"
          size="icon"
          aria-label={`Play ${title}`}
          disabled={!src}
          onClick={() => setActivated(true)}
        >
          <Play />
        </Button>
      </div>
    </div>
  );
};
