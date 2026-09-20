/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { ArtistListingName, ArtistListingRow } from '@/lib/types/domain/artist';

import { ArtistListCard } from './artist-list-card';

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

// Mock BioHtml so this spec stays on the fast vmThreads pool (the real BioHtml
// pulls in html-react-parser, which requires the forks pool). BioHtml behavior
// is covered in bio-html.spec; here we only need the teaser body to render.
vi.mock('./bio-html', () => ({
  BioHtml: ({ html, className }: { html: string; className?: string }) => (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  ),
}));

const name = (id: string, displayName: string): ArtistListingName => ({
  id,
  displayName,
  firstName: displayName,
  middleName: null,
  surname: '',
  title: null,
  suffix: null,
});

const baseArtist: ArtistListingRow = {
  id: 'a1',
  slug: 'test-artist',
  firstName: 'Test',
  middleName: null,
  surname: 'Artist',
  title: null,
  suffix: null,
  displayName: 'Test Artist',
  akaNames: null,
  genres: 'hip-hop, soul',
  instruments: null,
  shortBio: 'A short teaser bio.',
  bornOn: null,
  diedOn: null,
  formedOn: null,
  bioImages: [],
  members: [],
  memberOf: [],
  releaseCount: 3,
  newestRelease: { id: 'r3', title: 'Third Album', releasedOn: new Date('2024-09-01T00:00:00Z') },
};

describe('ArtistListCard', () => {
  it('links the artist name to the detail page', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Test Artist' })).toHaveAttribute(
      'href',
      '/artists/test-artist'
    );
  });

  it('stretches the name link over the whole card so the card is clickable', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Test Artist' })).toHaveClass(
      'after:absolute',
      'after:inset-0'
    );
  });

  it('no longer renders a separate View more link', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByRole('link', { name: /view more/i })).not.toBeInTheDocument();
  });

  it('carries the name, the latest release, and the full-bio link, in that order', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Test Artist',
      'Third Album',
      'View full bio',
    ]);
  });

  it('carries only the name link when the artist has no release and no bio', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          releaseCount: 0,
          newestRelease: null,
          shortBio: null,
          bioImages: [],
        }}
      />
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders the short bio and up to three genres', () => {
    render(<ArtistListCard artist={{ ...baseArtist, genres: 'hip-hop, soul, jazz, funk' }} />);

    expect(screen.getByText('A short teaser bio.')).toBeInTheDocument();
    expect(screen.getByText('hip-hop')).toBeInTheDocument();
    expect(screen.getByText('soul')).toBeInTheDocument();
    expect(screen.getByText('jazz')).toBeInTheDocument();
    expect(screen.queryByText('funk')).not.toBeInTheDocument();
  });

  it('renders the release-credits line with the newest release and its year', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    expect(container.querySelector('[data-slot="artist-credits"]')).toHaveTextContent(
      '3 releases · Latest: Third Album (2024)'
    );
  });

  it('uses the singular for a single release', () => {
    const { container } = render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          releaseCount: 1,
          newestRelease: {
            id: 'r1',
            title: 'Only One',
            releasedOn: new Date('2020-05-05T00:00:00Z'),
          },
        }}
      />
    );

    expect(container.querySelector('[data-slot="artist-credits"]')).toHaveTextContent(
      '1 release · Latest: Only One (2020)'
    );
  });

  it('links the latest release title to its release page', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Third Album' })).toHaveAttribute(
      'href',
      '/releases/r3'
    );
  });

  it('underlines the latest release title so it reads as a link', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Third Album' })).toHaveClass('underline');
  });

  it('raises the release link above the stretched card link so it opens the release', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Third Album' })).toHaveClass('relative', 'z-10');
  });

  it('omits the credits line when the artist has no listed release', () => {
    render(<ArtistListCard artist={{ ...baseArtist, releaseCount: 0, newestRelease: null }} />);

    expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument();
  });

  it('renders the bands the artist is a member of', () => {
    render(
      <ArtistListCard
        artist={{ ...baseArtist, memberOf: [name('b1', 'E2E Band'), name('b2', 'Other Band')] }}
      />
    );

    expect(screen.getByText('Member of E2E Band, Other Band')).toBeInTheDocument();
  });

  it('no longer lists a band’s members', () => {
    render(
      <ArtistListCard
        artist={{ ...baseArtist, members: [name('m1', 'E2E Artist'), name('m2', 'Drummer')] }}
      />
    );

    expect(screen.queryByText(/Members:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drummer/)).not.toBeInTheDocument();
  });

  it('omits the band line when the artist has no band relationships', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByText(/Member of|Members:/)).not.toBeInTheDocument();
  });

  it('renders the formation year for a band', () => {
    render(
      <ArtistListCard artist={{ ...baseArtist, formedOn: new Date('2010-01-01T00:00:00Z') }} />
    );

    expect(screen.getByText('Formed 2010')).toBeInTheDocument();
  });

  it('renders the instruments as a muted meta line', () => {
    render(<ArtistListCard artist={{ ...baseArtist, instruments: 'guitar, vocals' }} />);

    expect(screen.getByText('guitar, vocals')).toBeInTheDocument();
  });

  it('separates the formation year and instruments with a middle dot', () => {
    render(
      <ArtistListCard
        artist={{ ...baseArtist, formedOn: new Date('2010-01-01T00:00:00Z'), instruments: 'drums' }}
      />
    );

    expect(screen.getByText('Formed 2010 · drums')).toBeInTheDocument();
  });

  it('never shows a birth year', () => {
    const { container } = render(
      <ArtistListCard artist={{ ...baseArtist, bornOn: new Date('1975-01-01T00:00:00Z') }} />
    );

    expect(container.querySelector('[data-slot="artist-meta"]')).not.toBeInTheDocument();
  });

  it('never shows a death year alongside the instruments', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          bornOn: new Date('1975-01-01T00:00:00Z'),
          diedOn: new Date('2010-01-01T00:00:00Z'),
          instruments: 'drums',
        }}
      />
    );

    expect(screen.getByText('drums')).toBeInTheDocument();
  });

  it('omits the meta line when neither a formation year nor instruments are set', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    expect(container.querySelector('[data-slot="artist-meta"]')).not.toBeInTheDocument();
  });

  it('keeps the short bio out of the details column beside the images', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const details = container.querySelector<HTMLElement>('[data-slot="artist-details"]');
    const bio = container.querySelector<HTMLElement>('[data-slot="artist-short-bio"]');

    expect(details).toBeInTheDocument();
    expect(bio).toBeInTheDocument();
    expect(details).not.toContainElement(bio);
  });

  it('renders the short bio beneath the images and everything else', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const slots = [...(container.querySelector('[data-slot="card-content"]')?.children ?? [])].map(
      (child) => child.getAttribute('data-slot')
    );

    expect(slots).toEqual(['artist-summary-row', 'artist-short-bio', 'artist-full-bio-link']);
  });

  it('links to the full bio page from the bottom of the card', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /view full bio/i })).toHaveAttribute(
      'href',
      '/artists/test-artist/bio'
    );
  });

  it('raises the full-bio link above the stretched card link', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /view full bio/i })).toHaveClass('relative', 'z-10');
  });

  it('omits the full-bio link when the artist has neither a short bio nor images', () => {
    render(<ArtistListCard artist={{ ...baseArtist, shortBio: null, bioImages: [] }} />);

    expect(screen.queryByRole('link', { name: /view full bio/i })).not.toBeInTheDocument();
  });

  it('clamps the short bio to four lines', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const bio = container.querySelector('[data-slot="artist-short-bio"]');

    expect(bio?.firstElementChild).toHaveClass('line-clamp-4');
  });

  it('omits the short bio slot when the artist has no short bio', () => {
    const { container } = render(<ArtistListCard artist={{ ...baseArtist, shortBio: null }} />);

    expect(container.querySelector('[data-slot="artist-short-bio"]')).not.toBeInTheDocument();
  });

  it('renders primary image thumbnails when present', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          bioImages: [
            {
              id: 'bi1',
              url: 'https://x/a.jpg',
              thumbnailUrl: null,
              title: 'Portrait',
              attribution: 'Commons',
              license: null,
              licenseUrl: null,
              sourceUrl: null,
              alt: null,
              isPrimary: false,
              displayOrder: null,
            },
          ],
        }}
      />
    );

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Portrait');
  });

  it('prefers the image alt text over the title for the thumbnail', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          bioImages: [
            {
              id: 'bi1',
              url: 'https://x/a.jpg',
              thumbnailUrl: null,
              title: 'Portrait',
              attribution: null,
              license: null,
              licenseUrl: null,
              sourceUrl: null,
              alt: 'Test Artist on stage',
              isPrimary: false,
              displayOrder: 0,
            },
          ],
        }}
      />
    );

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Test Artist on stage');
  });

  it('raises the thumbnails above the stretched link so they open their dialog', () => {
    const { container } = render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          bioImages: [
            {
              id: 'bi1',
              url: 'https://x/a.jpg',
              thumbnailUrl: null,
              title: null,
              attribution: null,
              license: null,
              licenseUrl: null,
              sourceUrl: null,
              alt: null,
              isPrimary: false,
              displayOrder: null,
            },
          ],
        }}
      />
    );

    const thumbs = container.querySelector('[data-slot="artist-thumbnails"]');
    expect(thumbs).toHaveClass('relative', 'z-10');
  });

  it('shows a placeholder icon when there are no images', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByTestId('thumb')).not.toBeInTheDocument();
  });

  it('styles the card as a punk photo card without the soft hover shadow', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('shadow-zine-sm', 'bg-white', 'relative');
    expect(card).not.toHaveClass('hover:shadow-md');
    expect(card).not.toHaveClass('transition-shadow');
  });

  it('renders the no-image placeholder without rounded corners', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const placeholder = container.querySelector('.bg-muted');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).not.toHaveClass('rounded-lg');
  });
});
