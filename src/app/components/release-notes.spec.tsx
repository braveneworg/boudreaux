/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { FORMATS } from '@/lib/types/domain/shared';

import { ReleaseNotes } from './release-notes';

vi.mock('./release-summary-card', () => ({
  ReleaseSummaryCard: ({
    title,
    artistName,
    coverArt,
    releasedOn,
    formats,
    className,
  }: {
    title: string;
    artistName: string | null;
    coverArt: { src: string; alt: string } | null;
    releasedOn: Date;
    formats: string[];
    className?: string;
  }) => (
    <div
      data-testid="release-summary-card"
      data-title={title}
      data-artist={artistName ?? ''}
      data-cover-src={coverArt?.src ?? ''}
      data-released-on={releasedOn.toISOString()}
      data-formats={formats.join(',')}
      data-classname={className ?? ''}
    />
  ),
}));

vi.mock('./ui/zine-heading', () => ({
  ZineHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

describe('ReleaseNotes', () => {
  const release = {
    title: 'Midnight Serenade',
    coverArt: 'https://cdn.example.com/cover.jpg',
    releasedOn: new Date(2024, 0, 2),
    formats: [FORMATS.DIGITAL],
    description: 'A real description of the album.',
  };

  it('should render a "Release Notes" heading', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    expect(screen.getByRole('heading', { name: /release notes/i })).toBeInTheDocument();
  });

  it('should render the real release description', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    expect(screen.getByText('A real description of the album.')).toBeInTheDocument();
  });

  it('should render placeholder lorem ipsum notes', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    expect(screen.getByTestId('release-notes-body')).toHaveTextContent(/Lorem ipsum/i);
  });

  it('should weave real release details into the notes', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    const body = screen.getByTestId('release-notes-body');
    expect(body).toHaveTextContent('Midnight Serenade');
    expect(body).toHaveTextContent(/Jan 2, 2024/);
  });

  it('should pass the resolved cover and details to the summary card', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    const card = screen.getByTestId('release-summary-card');
    expect(card).toHaveAttribute('data-cover-src', 'https://cdn.example.com/cover.jpg');
    expect(card).toHaveAttribute('data-title', 'Midnight Serenade');
    expect(card).toHaveAttribute('data-artist', 'John Doe');
    expect(card).toHaveAttribute('data-released-on', new Date(2024, 0, 2).toISOString());
    expect(card).toHaveAttribute('data-formats', 'DIGITAL');
  });

  it('should float the summary card so the notes wrap around it', () => {
    render(<ReleaseNotes release={release} artistName="John Doe" />);

    const card = screen.getByTestId('release-summary-card');
    expect(card.getAttribute('data-classname')).toContain('sm:float-left');
  });

  it('should omit the real description block when there is no description', () => {
    render(<ReleaseNotes release={{ ...release, description: null }} artistName="John Doe" />);

    expect(screen.queryByText('A real description of the album.')).not.toBeInTheDocument();
    expect(screen.getByTestId('release-notes-body')).toHaveTextContent(/Lorem ipsum/i);
  });

  it('should resolve a null cover when coverArt is empty', () => {
    render(<ReleaseNotes release={{ ...release, coverArt: '' }} artistName="John Doe" />);

    expect(screen.getByTestId('release-summary-card')).toHaveAttribute('data-cover-src', '');
  });
});
