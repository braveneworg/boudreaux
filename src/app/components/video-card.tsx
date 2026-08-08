/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Film, Play } from 'lucide-react';

import { VideoPlayDialog } from '@/components/ui/video/video-play-dialog';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatTourDate } from '@/lib/utils/date-utils';
import { formatVideoDuration } from '@/lib/utils/format-duration';
import type { VideoRow } from '@/lib/validation/video-schema';

import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { videoMediaItem } from './playlists/player-media-item';

interface VideoCardProps {
  video: VideoRow;
}

/**
 * Public listing row for a single published video, laid out zine-paste-up
 * style: a framed poster on the left (~1/3 width; stacked on mobile) with the
 * title, artist, description, and release metadata typeset beside it. Only the
 * poster carries the zine border/shadow. Clicking it primes a media element
 * inside the gesture (so Safari/iOS and Firefox honor the deferred autoplay)
 * and opens the enlarged modal player, which starts playback immediately. The
 * read-only counterpart to the admin `VideoAdminCard` — no lifecycle actions.
 */
export const VideoCard = ({ video }: VideoCardProps): ReactElement => {
  const [playerOpen, setPlayerOpen] = useState(false);
  const { primeMediaEl, takeMediaEl } = usePrimedMediaHandoff();
  const src = resolveStreamUrl(video);
  const mediaItem = videoMediaItem({
    videoId: video.id,
    title: video.title,
    artistName: video.artist,
    coverArt: video.posterUrl ?? null,
    duration: video.durationSeconds,
  });

  const openPlayer = (): void => {
    // Prime inside the click gesture so the modal surface's deferred autoplay
    // survives per-element autoplay policies (see usePrimedMediaHandoff).
    primeMediaEl();
    setPlayerOpen(true);
  };

  return (
    <article className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-6">
      <button
        type="button"
        aria-label={`Play ${video.title}`}
        disabled={!src}
        onClick={openPlayer}
        className="group bg-muted shadow-zine-sm relative block aspect-video w-full cursor-pointer overflow-hidden border-2 border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed"
      >
        {video.posterUrl ? (
          <Image
            src={video.posterUrl}
            alt=""
            fill
            unoptimized
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <Film className="size-10" aria-hidden />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center border-2 border-white bg-black/70 text-white transition-colors duration-300 group-hover:bg-black">
            <Play className="size-5 fill-current" aria-hidden />
          </span>
        </span>
      </button>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-fake-four-cutout text-xl break-words text-zinc-950">
              {video.title}
            </h2>
            <p className="text-sm text-zinc-600">{video.artist}</p>
          </div>
          <AddToPlaylistMenu item={mediaItem} className="shrink-0" />
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
          <div className="flex gap-1">
            <dt className="font-medium text-zinc-950">Release date:</dt>
            <dd>{formatTourDate(video.releasedOn)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium text-zinc-950">Duration:</dt>
            <dd>{formatVideoDuration(video.durationSeconds)}</dd>
          </div>
        </dl>

        {video.description ? (
          <p className="text-sm break-words whitespace-pre-line text-zinc-950">
            {video.description}
          </p>
        ) : null}
      </div>

      {src ? (
        <VideoPlayDialog
          title={video.title}
          artist={video.artist}
          src={src}
          open={playerOpen}
          onOpenChange={setPlayerOpen}
          takeMediaEl={takeMediaEl}
        />
      ) : null}
    </article>
  );
};
