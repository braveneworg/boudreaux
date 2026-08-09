/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactElement } from 'react';

import type { PublishedReleaseListing } from '@/lib/types/media-models';
import { formatTourDate } from '@/lib/utils/date-utils';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getFirstTrackStreamSource,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import { ReleaseCard } from './release-card';

/** Shared typography for the info column's prose: the description and each note. */
const PROSE_CLASS = 'text-sm break-words whitespace-pre-line text-zinc-950';

interface ReleaseListRowProps {
  /** Raw published-listing row; the row derives every display value itself. */
  release: PublishedReleaseListing;
}

/**
 * Public listing row for a single release, laid out zine-paste-up style like
 * the `/videos` rows: the sleeve card on the left (~1/3 width; stacked on
 * mobile) with the release info typeset beside it. The card keeps its own
 * border/shadow as a discrete "physical object"; the info column carries the
 * labeled metadata and then the blurb — the short listing copy. The label's
 * long-form release notes belong to the detail page, not this row.
 */
export const ReleaseListRow = ({ release }: ReleaseListRowProps): ReactElement => {
  const artistName = release.artistReleases[0]
    ? (getArtistDisplayNameForRelease(release.artistReleases[0].artist) ?? 'Unknown Artist')
    : 'Unknown Artist';

  return (
    <article className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-6">
      <ReleaseCard
        id={release.id}
        title={release.title}
        artistName={artistName}
        coverArt={getReleaseCoverArt(release)}
        releasedOn={release.releasedOn}
        bandcampUrl={getBandcampUrl(release)}
        playSrc={getFirstTrackStreamSource(release)}
      />

      <div className="flex min-w-0 flex-col gap-2">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
          <div className="flex gap-1">
            <dt className="font-medium text-zinc-950">Release date:</dt>
            <dd>{formatTourDate(release.releasedOn)}</dd>
          </div>
          {release.catalogNumber ? (
            <div className="flex gap-1">
              <dt className="font-medium text-zinc-950">Catalog no.:</dt>
              <dd>{release.catalogNumber}</dd>
            </div>
          ) : null}
        </dl>

        {release.formats.length > 0 ? (
          <ul aria-label="Available formats" className="flex flex-wrap gap-1">
            {release.formats.map((format) => (
              <li
                key={format}
                className="border-2 border-black px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-black uppercase"
              >
                {format.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        ) : null}

        {release.description ? <p className={PROSE_CLASS}>{release.description}</p> : null}
      </div>
    </article>
  );
};
