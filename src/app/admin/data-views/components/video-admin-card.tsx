/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Link from 'next/link';

import { Pencil } from 'lucide-react';

import { formatFileSize } from '@/app/components/forms/digital-formats/file-helpers';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { VideoPlayer } from '@/components/ui/video/video-player';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatDuration } from '@/lib/utils/format-duration';
import type { VideoRow } from '@/lib/validation/video-schema';

import { formatFieldDate } from '../data-view-utils';
import { VideoArchiveDialog } from './video-archive-dialog';
import { VideoPublishDialog } from './video-publish-dialog';

/** Callbacks the admin card invokes for each lifecycle action, by video id. */
export interface VideoCardHandlers {
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

interface VideoAdminCardProps extends VideoCardHandlers {
  video: VideoRow;
}

/** One label/value metadata row rendered in the card's definition list. */
interface MetadataRow {
  label: string;
  value: string;
}

/** Build the human-readable metadata rows for a video. */
const buildVideoMetadata = (video: VideoRow): MetadataRow[] => {
  const categoryLabel = video.category === 'MUSIC' ? 'Music' : 'Informational';
  const sizeSuffix = video.fileSize === null ? '' : ` · ${formatFileSize(Number(video.fileSize))}`;

  return [
    { label: 'Artist', value: video.artist },
    { label: 'Category', value: categoryLabel },
    { label: 'Released', value: formatFieldDate(video.releasedOn) },
    { label: 'Duration', value: formatDuration(video.durationSeconds) },
    { label: 'File', value: `${video.fileName}${sizeSuffix}` },
    { label: 'Created', value: formatFieldDate(video.createdAt) },
    { label: 'Updated', value: formatFieldDate(video.updatedAt) },
  ];
};

/** Publish/draft and archived status badges for a video. */
const VideoStatusBadges = ({
  isPublished,
  isArchived,
}: {
  isPublished: boolean;
  isArchived: boolean;
}): ReactElement => (
  <div className="flex flex-wrap gap-2">
    <Badge variant={isPublished ? 'default' : 'secondary'}>
      {isPublished ? 'Published' : 'Draft'}
    </Badge>
    {isArchived ? <Badge variant="outline">Archived</Badge> : null}
  </div>
);

/**
 * Admin listing card for a single video: an inline lazy player, status badges,
 * a metadata definition list, and the state-dependent lifecycle actions
 * (edit, publish/unpublish, archive/restore, delete).
 */
export const VideoAdminCard = ({
  video,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDelete,
}: VideoAdminCardProps): ReactElement => {
  const isPublished = video.publishedAt !== null;
  const isArchived = video.archivedAt !== null;
  const metadata = buildVideoMetadata(video);

  const confirmPublish = (): void => (isPublished ? onUnpublish : onPublish)(video.id);
  const confirmArchive = (): void => (isArchived ? onRestore : onArchive)(video.id);
  const confirmDelete = (): void => onDelete(video.id);

  return (
    <Card className="m-0">
      <CardContent className="space-y-4 p-4">
        <VideoPlayer
          title={video.title}
          src={resolveStreamUrl(video)}
          posterUrl={video.posterUrl}
        />

        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-fake-four-cutout text-lg break-words">{video.title}</h3>
          <VideoStatusBadges isPublished={isPublished} isArchived={isArchived} />
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {metadata.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="text-muted-foreground shrink-0">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/videos/${video.id}`}>
              <Pencil className="mr-0 size-4" aria-hidden="true" />
              Edit
            </Link>
          </Button>
          <VideoPublishDialog
            verb={isPublished ? 'unpublish' : 'publish'}
            title={video.title}
            onConfirm={confirmPublish}
          />
          <VideoArchiveDialog
            verb={isArchived ? 'restore' : 'archive'}
            title={video.title}
            onConfirm={confirmArchive}
          />
          <VideoArchiveDialog verb="delete" title={video.title} onConfirm={confirmDelete} />
        </div>
      </CardContent>
    </Card>
  );
};
