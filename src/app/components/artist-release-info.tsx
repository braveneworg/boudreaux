/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Separator } from './ui/separator';

interface ArtistReleaseInfoProps {
  artistName: string;
  title: string;
  /** When true, the artist name heading is visible rather than screen-reader-only. */
  visibleHeading?: boolean;
}

export const ArtistReleaseInfo = ({
  artistName,
  title,
  visibleHeading = false,
}: ArtistReleaseInfoProps) => (
  <>
    <article className="flex flex-col justify-center text-sm gap-1 items-center px-2 -mb-1.5">
      <h2
        className={
          visibleHeading
            ? 'text-sm font-bold tracking-normal text-shadow-accent mb-0 pb-0 leading-0 mt-3'
            : 'sr-only text-lg font-semibold'
        }
        aria-label={`Now playing: ${artistName} - ${title}`}
      >
        {artistName}
      </h2>
      <p>
        <em>{title}</em>
      </p>
    </article>
    <Separator className="bg-zinc-300 mx-auto mt-3 mb-1 min-h-px max-h-px max-w-[calc(100%-2rem)]" />
  </>
);
