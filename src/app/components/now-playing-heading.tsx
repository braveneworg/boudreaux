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
    <section className="flex flex-col justify-center text-sm gap-1 items-center px-2">
      <h3
        className={
          visibleHeading
            ? 'text-sm font-bold tracking-normal text-shadow-accent mb-0 pb-0 leading-0 mt-3'
            : 'sr-only text-lg font-semibold'
        }
        aria-label={`Now playing: ${artistName} - ${title}`}
      >
        {artistName} - <span className="font-normal italic">{title}</span>
      </h3>
    </section>
  );
};
