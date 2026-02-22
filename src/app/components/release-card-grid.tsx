/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseCardGrid component for the public releases listing page.
 * Renders a responsive CSS Grid of ReleaseCard components.
 * Displays an empty state message when no releases are available.
 */
import { ReleaseCard } from '@/app/components/release-card';

interface ReleaseCardGridRelease {
  /** Unique release identifier */
  id: string;
  /** Release title */
  title: string;
  /** Resolved artist display name */
  artistName: string;
  /** Cover art source and alt text, or null for styled placeholder */
  coverArt: { src: string; alt: string } | null;
  /** Bandcamp URL for external purchase link, or null */
  bandcampUrl: string | null;
}

interface ReleaseCardGridProps {
  /** Array of releases to display in the grid */
  releases: ReleaseCardGridRelease[];
}

/**
 * A responsive grid that renders a ReleaseCard for each release.
 * Columns: 1 (mobile) → 2 (sm) → 3 (md) → 4 (lg).
 * Shows an empty state when no releases are provided.
 */
export const ReleaseCardGrid = ({ releases }: ReleaseCardGridProps) => {
  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <p>No releases available.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="release-card-grid"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    >
      {releases.map((release) => (
        <ReleaseCard
          key={release.id}
          id={release.id}
          title={release.title}
          artistName={release.artistName}
          coverArt={release.coverArt}
          bandcampUrl={release.bandcampUrl}
        />
      ))}
    </div>
  );
};
