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
  };
  /** Resolved artist display name, or null if unresolvable */
  artistName: string | null;
}

/**
 * Placeholder release-notes copy shown until real per-release notes are authored.
 * Kept as a single constant so it is trivial to remove once notes go live.
 */
const RELEASE_NOTES_PLACEHOLDER = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus temporibus autem.',
];

/**
 * The "Release Notes" section on the release detail page: a zine cutout heading
 * over a floated {@link ReleaseSummaryCard} that the notes copy wraps around.
 * For now the body is the release's own description (when present) followed by a
 * detail-seeded lead and placeholder lorem ipsum, combining real release details
 * with filler until authored notes exist.
 */
export const ReleaseNotes = ({ release, artistName }: ReleaseNotesProps): ReactElement => {
  const { title, coverArt, releasedOn, formats, description } = release;
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
        {description && <p className="mb-4 break-words whitespace-pre-line">{description}</p>}
        <p className="mb-4">{lead}</p>
        {RELEASE_NOTES_PLACEHOLDER.map((paragraph) => (
          <p key={paragraph} className="mb-4">
            {paragraph}
          </p>
        ))}
        <div className="clear-both" />
      </div>
    </section>
  );
};
