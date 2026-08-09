/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { PublishedReleaseListing } from '@/lib/types/media-models';
import { formatTourDate } from '@/lib/utils/date-utils';

import { ReleaseListRow } from './release-list-row';

// Deterministic CDN resolution — the real util reads env vars.
vi.mock('@/lib/utils/cdn-url', () => ({
  resolveStreamUrl: (file: { s3Key?: string | null; streamUrl?: string | null }) =>
    file.streamUrl ?? (file.s3Key ? `https://cdn.example.com/${file.s3Key}` : null),
}));

// Stub the card — its behavior is covered by release-card.spec. The row's job
// is deriving the card props from the raw listing row and laying out the
// info column beside it.
vi.mock('./release-card', () => ({
  ReleaseCard: ({
    id,
    title,
    artistName,
    coverArt,
    bandcampUrl,
    playSrc,
  }: {
    id: string;
    title: string;
    artistName: string | null;
    coverArt: { src: string; alt: string } | null;
    releasedOn: Date;
    bandcampUrl: string | null;
    playSrc: string | null;
  }) => (
    <div
      data-testid="release-card"
      data-id={id}
      data-title={title}
      data-artist={artistName ?? ''}
      data-cover-src={coverArt?.src ?? ''}
      data-bandcamp={bandcampUrl ?? ''}
      data-play-src={playSrc ?? ''}
    />
  ),
}));

const releasedOn = new Date(2024, 0, 5);

const baseRelease: PublishedReleaseListing = {
  id: 'release-1',
  title: 'Midnight Serenade',
  coverArt: 'https://cdn.example.com/cover.jpg',
  releasedOn,
  description: 'Recorded in a basement over one hot weekend.',
  notes: ['Pressed on 180g wax.', 'Includes a hand-screened insert.'],
  formats: ['VINYL_12_INCH', 'MP3_320KBPS'],
  catalogNumber: 'FF4-042',
  images: [],
  artistReleases: [
    {
      artist: {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'JD the Great',
        slug: 'jd-the-great',
      },
    },
  ],
  releaseUrls: [{ url: { platform: 'BANDCAMP', url: 'https://label.bandcamp.com/album/x' } }],
  digitalFormats: [{ files: [{ s3Key: 'releases/r1/tracks/01.mp3' }] }],
};

describe('ReleaseListRow', () => {
  it('derives the card props from the raw listing row', () => {
    render(<ReleaseListRow release={baseRelease} />);

    const card = screen.getByTestId('release-card');
    expect(card).toHaveAttribute('data-id', 'release-1');
    expect(card).toHaveAttribute('data-title', 'Midnight Serenade');
    expect(card).toHaveAttribute('data-artist', 'JD the Great');
    expect(card).toHaveAttribute('data-cover-src', 'https://cdn.example.com/cover.jpg');
    expect(card).toHaveAttribute('data-bandcamp', 'https://label.bandcamp.com/album/x');
    expect(card).toHaveAttribute(
      'data-play-src',
      'https://cdn.example.com/releases/r1/tracks/01.mp3'
    );
  });

  it('passes a null play source when the release has no MP3 track', () => {
    render(<ReleaseListRow release={{ ...baseRelease, digitalFormats: [] }} />);

    expect(screen.getByTestId('release-card')).toHaveAttribute('data-play-src', '');
  });

  it('lays the card beside the info column on desktop', () => {
    const { container } = render(<ReleaseListRow release={baseRelease} />);

    const row = container.firstElementChild;
    expect(row?.tagName).toBe('ARTICLE');
    expect(row).toHaveClass(
      'sm:grid',
      'sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
      'sm:items-start'
    );
  });

  it('shows the labeled release date', () => {
    render(<ReleaseListRow release={baseRelease} />);

    expect(screen.getByText('Release date:')).toBeInTheDocument();
    expect(screen.getByText(formatTourDate(releasedOn))).toBeInTheDocument();
  });

  it('shows the labeled catalog number', () => {
    render(<ReleaseListRow release={baseRelease} />);

    expect(screen.getByText('Catalog no.:')).toBeInTheDocument();
    expect(screen.getByText('FF4-042')).toBeInTheDocument();
  });

  it('omits the catalog row when the release has no catalog number', () => {
    render(<ReleaseListRow release={{ ...baseRelease, catalogNumber: null }} />);

    expect(screen.queryByText('Catalog no.:')).not.toBeInTheDocument();
  });

  it('renders the formats as uppercase zine tags', () => {
    render(<ReleaseListRow release={baseRelease} />);

    const chips = screen.getByRole('list', { name: 'Available formats' });
    expect(chips).toHaveTextContent('VINYL 12 INCH');
    expect(chips).toHaveTextContent('MP3 320KBPS');
  });

  it('omits the format tags when the release lists none', () => {
    render(<ReleaseListRow release={{ ...baseRelease, formats: [] }} />);

    expect(screen.queryByRole('list', { name: 'Available formats' })).not.toBeInTheDocument();
  });

  it('renders the description prose', () => {
    render(<ReleaseListRow release={baseRelease} />);

    expect(screen.getByText('Recorded in a basement over one hot weekend.')).toBeInTheDocument();
  });

  it('omits the description paragraph when the release has none', () => {
    render(<ReleaseListRow release={{ ...baseRelease, description: null }} />);

    expect(
      screen.queryByText('Recorded in a basement over one hot weekend.')
    ).not.toBeInTheDocument();
  });

  it('renders each release note as its own paragraph', () => {
    render(<ReleaseListRow release={baseRelease} />);

    expect(screen.getByText('Pressed on 180g wax.')).toBeInTheDocument();
    expect(screen.getByText('Includes a hand-screened insert.')).toBeInTheDocument();
  });

  it('renders the notes when the release has no description', () => {
    render(<ReleaseListRow release={{ ...baseRelease, description: null }} />);

    expect(screen.getByText('Pressed on 180g wax.')).toBeInTheDocument();
  });

  it('renders the description when the release has no notes', () => {
    render(<ReleaseListRow release={{ ...baseRelease, notes: [] }} />);

    expect(screen.getByText('Recorded in a basement over one hot weekend.')).toBeInTheDocument();
  });

  it('omits the prose block entirely when the release has no notes or description', () => {
    const { container } = render(
      <ReleaseListRow release={{ ...baseRelease, description: null, notes: [] }} />
    );

    expect(container.querySelector('p.whitespace-pre-line')).not.toBeInTheDocument();
  });
});
