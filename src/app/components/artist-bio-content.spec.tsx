/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistBioContent } from './artist-bio-content';

const useArtistBySlugQueryMock = vi.fn();
vi.mock('@/app/hooks/use-artist-by-slug-query', () => ({
  useArtistBySlugQuery: (slug: string) => useArtistBySlugQueryMock(slug),
}));

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

// Mock BioHtml so this spec stays on the fast vmThreads pool (the real BioHtml
// pulls in html-react-parser, which requires the forks pool). A simple
// dangerouslySetInnerHTML stand-in is enough to assert the bio body renders.
vi.mock('./bio-html', () => ({
  BioHtml: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: { displayName?: string | null }) =>
    artist.displayName ?? 'Unknown',
}));

const artist = {
  displayName: 'Test Artist',
  slug: 'test-artist',
  shortBio: 'Short teaser.',
  bio: '<p>Long <strong>bio</strong> body.</p>',
  genres: 'jazz, funk',
  bioImages: [
    {
      id: 'bi1',
      url: 'https://x/a.jpg',
      thumbnailUrl: null,
      title: 'Portrait',
      attribution: 'Commons',
      license: null,
      sourceUrl: null,
      isPrimary: true,
    },
  ],
  bioLinks: [
    { id: 'bl1', label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/x', kind: 'wikipedia' },
  ],
};

describe('ArtistBioContent', () => {
  it('shows a spinner while pending', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: true });

    const { container } = render(<ArtistBioContent slug="test-artist" />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows a not-found message when there is no data', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: null, error: undefined });

    render(<ArtistBioContent slug="missing" />);

    expect(screen.getByText('Artist not found')).toBeInTheDocument();
  });

  it('renders the sanitized long bio, genres, and image gallery', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistBioContent slug="test-artist" />);

    expect(screen.getByText('bio')).toBeInTheDocument();
    expect(screen.getByText('jazz')).toBeInTheDocument();
    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Portrait');
  });

  it('renders external links with nofollow noopener noreferrer', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistBioContent slug="test-artist" />);

    const link = screen.getByRole('link', { name: 'Wikipedia' });
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
