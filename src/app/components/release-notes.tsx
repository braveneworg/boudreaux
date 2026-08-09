/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactElement } from 'react';

import type { Format } from '@/lib/types/domain/shared';
import { formatTourDate } from '@/lib/utils/date-utils';

import { ReleaseSummaryCard } from './release-summary-card';
import { ZineHeading } from './ui/zine-heading';

interface ReleaseNotesProps {
  /** The release whose notes are shown (narrowed to the fields this section uses). */
  release: {
    title: string;
    coverArt: string;
    releasedOn: Date;
    formats: Format[];
    description: string | null;
    notes: string[];
  };
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
}

/**
 * The "Release Notes" section on the release detail page: a zine cutout heading
 * over a floated {@link ReleaseSummaryCard} that the notes copy wraps around.
 * The body is a one-line factual lead, the release's own description when set,
 * then each authored note paragraph — generated in admin from web evidence.
 * A release with neither still reads as the lead rather than filler.
 */
export const ReleaseNotes = ({ release, artistName }: ReleaseNotesProps): ReactElement => {
  const { title, coverArt, releasedOn, formats, description, notes } = release;
  const resolvedCover = coverArt ? { src: coverArt, alt: `${title} cover art` } : null;
  const lead = `${title}${artistName ? ` by ${artistName}` : ''} was released on ${formatTourDate(releasedOn)}.`;

  return (
    <section aria-labelledby="release-notes-heading" className="px-4 py-4">
      <ZineHeading level={2} id="release-notes-heading">
        Release Notes
      </ZineHeading>

      <div data-testid="release-notes-body" className="text-sm leading-relaxed text-zinc-800">
        <ReleaseSummaryCard
          title={title}
          artistName={artistName}
          coverArt={resolvedCover}
          releasedOn={releasedOn}
          formats={formats}
          className="mb-4 w-full sm:float-left sm:mr-6 sm:w-56"
        />
        <p className="mb-4">{lead}</p>
        {description && <p className="mb-4 break-words whitespace-pre-line">{description}</p>}
        {notes.map((paragraph) => (
          <p key={paragraph} className="mb-4 break-words whitespace-pre-line">
            {paragraph}
          </p>
        ))}
        <div className="clear-both" />
      </div>
    </section>
  );
};
