/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import { VideoPlayer } from '@/app/components/ui/video/video-player';
import type { AttachmentView } from '@/lib/types/domain/submission-attachment';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

/** The size a photo is laid out at when its re-encode recorded none. */
const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 800;

interface AttachmentMediaProps {
  attachment: AttachmentView;
  /** What a screen reader calls it: the submission's title and its place. */
  label: string;
}

/**
 * One ready attachment. A photo is the one file the re-encode wrote, so it is
 * served as it is. A video is the site's own player behind its poster, and
 * audio the browser's; neither loads anything until asked, since a page may
 * hold ten of them.
 */
const AttachmentMedia = ({ attachment, label }: AttachmentMediaProps) => {
  const { kind, url, posterUrl, width, height } = attachment;
  if (url === null) {
    return null;
  }

  if (kind === 'IMAGE') {
    return (
      <Image
        {...resolveCdnImageSource(url)}
        alt={label}
        width={width ?? FALLBACK_WIDTH}
        height={height ?? FALLBACK_HEIGHT}
        className="border-foreground h-auto w-full border-2"
      />
    );
  }

  if (kind === 'AUDIO') {
    return <audio controls preload="none" src={url} aria-label={label} className="w-full" />;
  }

  return <VideoPlayer title={label} src={url} posterUrl={posterUrl} />;
};

/** An attachment with no copy to show yet, as its owner and approvers read it. */
const AttachmentNote = ({
  attachment: { fileName, state, error },
}: {
  attachment: AttachmentView;
}) =>
  state === 'failed' ? (
    <p className="text-destructive text-sm">{`${fileName}: ${error ?? ''}`}</p>
  ) : (
    <p role="status" className="text-sm">{`${fileName} is still processing.`}</p>
  );

export interface SubmissionAttachmentGalleryProps {
  /** In upload order, with the addresses this reader may use. */
  attachments: AttachmentView[];
  /** The submission's title, for each attachment's accessible name. */
  title: string;
}

/**
 * A submission's attachments, in upload order. The public is only ever given
 * ready ones; its owner and approvers also see what is still processing and
 * what failed.
 */
export const SubmissionAttachmentGallery = ({
  attachments,
  title,
}: SubmissionAttachmentGalleryProps) =>
  attachments.length === 0 ? null : (
    <ul aria-label="Attachments" className="mt-6 space-y-6">
      {attachments.map((attachment, index) => (
        <li key={attachment.id}>
          {attachment.state === 'ready' ? (
            <AttachmentMedia
              attachment={attachment}
              label={`${title}, attachment ${index + 1} of ${attachments.length}`}
            />
          ) : (
            <AttachmentNote attachment={attachment} />
          )}
        </li>
      ))}
    </ul>
  );
