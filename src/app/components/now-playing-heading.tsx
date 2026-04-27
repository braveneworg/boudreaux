/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface NowPlayingHeadingProps {
  artistName: string;
  title: string;
  /** When true, the artist name heading is visible rather than screen-reader-only. */
  visibleHeading?: boolean;
}

export const NowPlayingHeading = ({
  artistName,
  title,
  visibleHeading = false,
}: NowPlayingHeadingProps) => {
  return (
    <section className="flex flex-col items-center justify-center gap-1 px-2 text-sm">
      <h3
        className={
          visibleHeading
            ? 'mt-0 mb-1 pb-0 text-sm font-bold tracking-normal'
            : 'sr-only text-lg font-semibold'
        }
        aria-label={`Now playing: ${artistName} - ${title}`}
      >
        {artistName} - <span className="font-normal italic">{title}</span>
      </h3>
    </section>
  );
};
