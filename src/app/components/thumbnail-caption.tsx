/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactElement } from 'react';

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
export const ThumbnailCaption = ({
  caption,
  attribution,
  license,
  sourceUrl,
}: ThumbnailCaptionProps): ReactElement | null => {
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
