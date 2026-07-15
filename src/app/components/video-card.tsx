/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { Badge } from '@/app/components/ui/badge';
import { VideoPlayer } from '@/components/ui/video/video-player';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatTourDate } from '@/lib/utils/date-utils';
import { formatVideoDuration } from '@/lib/utils/format-duration';
import type { VideoRow } from '@/lib/validation/video-schema';

interface VideoCardProps {
  video: VideoRow;
}

/**
 * Public listing card for a single published video: an inline lazy player, the
 * title, artist/creator, a category badge, release date + duration metadata, and
 * the admin-entered description (rendered only when present). The read-only
 * counterpart to the admin `VideoAdminCard` — no lifecycle actions.
 */
export const VideoCard = ({ video }: VideoCardProps): ReactElement => {
  const categoryLabel = video.category === 'MUSIC' ? 'Music' : 'Informational';

  return (
    <article className="shadow-zine-sm flex flex-col gap-3 border-2 border-black bg-white p-4">
      <VideoPlayer title={video.title} src={resolveStreamUrl(video)} posterUrl={video.posterUrl} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-fake-four-cutout text-xl break-words text-zinc-950">{video.title}</h2>
          <p className="text-sm text-zinc-600">{video.artist}</p>
        </div>
        <Badge variant={video.category === 'MUSIC' ? 'default' : 'secondary'}>
          {categoryLabel}
        </Badge>
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
        <div className="flex gap-1">
          <dt className="sr-only">Released</dt>
          <dd>{formatTourDate(video.releasedOn)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Duration</dt>
          <dd>{formatVideoDuration(video.durationSeconds)}</dd>
        </div>
      </dl>

      {video.description ? (
        <p className="text-sm break-words whitespace-pre-line text-zinc-950">{video.description}</p>
      ) : null}
    </article>
  );
};
