/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Film } from 'lucide-react';

import { VideoPlayDialog } from '@/components/ui/video/video-play-dialog';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatTourDate } from '@/lib/utils/date-utils';
import { formatVideoDuration } from '@/lib/utils/format-duration';
import type { VideoRow } from '@/lib/validation/video-schema';

import { PlaySharpIcon } from './icons/play-sharp-icon';
import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { videoMediaItem } from './playlists/player-media-item';

interface VideoCardProps {
  video: VideoRow;
}

/**
 * Public listing row for a single published video, laid out zine-paste-up
 * style: a framed poster on the left (~1/3 width; stacked on mobile) with the
 * title, artist, description, and release metadata typeset beside it. Only the
 * poster carries the zine border/shadow, and wears the same zine play stamp as
 * the spotlight covers — translucent at rest so the frame still reads as a
 * video, solid on hover or keyboard focus. Clicking it primes a media element
 * inside the gesture (so Safari/iOS and Firefox honor the deferred autoplay)
 * and opens the enlarged modal player, which starts playback immediately.
 * Clicking it again while that modal is hidden in picture-in-picture brings
 * the modal back instead of starting a second playback. The read-only
 * counterpart to the admin `VideoAdminCard` — no lifecycle actions.
 */
export const VideoCard = ({ video }: VideoCardProps): ReactElement => {
  const [playerOpen, setPlayerOpen] = useState(false);
  const { primeMediaEl, takeMediaEl, discardMediaEl } = usePrimedMediaHandoff('video');
  const src = resolveStreamUrl(video);
  const mediaItem = videoMediaItem({
    videoId: video.id,
    title: video.title,
    artistName: video.artist,
    coverArt: video.posterUrl ?? null,
    duration: video.durationSeconds,
  });

  const openPlayer = (): void => {
    if (playerOpen) {
      // Still open, so its modal is hidden while the video plays
      // picture-in-picture. Leaving picture-in-picture shows the modal again;
      // priming here would start a second, orphaned element.
      document.exitPictureInPicture?.().catch(() => {});
      return;
    }
    // Start playback of the real source inside the click gesture — allowed by
    // every autoplay policy, unlike a deferred play(), which strict profiles
    // and extensions can reject (see usePrimedMediaHandoff).
    primeMediaEl(src ?? undefined);
    setPlayerOpen(true);
  };

  const handlePlayerOpenChange = (open: boolean): void => {
    if (!open) {
      // Closed before the lazy surface adopted the element — stop it, or the
      // gesture-started audio keeps playing with no UI attached.
      discardMediaEl();
    }
    setPlayerOpen(open);
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
        <span
          data-slot="video-play-stamp"
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {/* The spotlight cover's zine stamp: a black glyph on white in the
              site's hard-border box; a press pushes it onto its ink shadow. */}
          <span className="shadow-zine-ink flex size-11 items-center justify-center border-2 border-black bg-white transition-[translate,box-shadow] duration-100 group-active:translate-x-0.5 group-active:translate-y-0.5 group-active:shadow-none motion-reduce:transition-none">
            <PlaySharpIcon className="ml-0.5 size-5 fill-current text-black" />
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
          {video.releasedOn ? (
            <div className="flex gap-1">
              <dt className="font-medium text-zinc-950">Release date:</dt>
              <dd>{formatTourDate(video.releasedOn)}</dd>
            </div>
          ) : null}
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
          onOpenChange={handlePlayerOpenChange}
          takeMediaEl={takeMediaEl}
        />
      ) : null}
    </article>
  );
};
