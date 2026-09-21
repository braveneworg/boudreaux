/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { ArtistListingName, ArtistListingRow } from '@/lib/types/domain/artist';

import { ArtistListCard } from './artist-list-card';

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

type BioImage = ArtistListingRow['bioImages'][number];

/** A listing bio-image row; the listing service already resolved these. */
const bioImage = (id: string, overrides: Partial<BioImage> = {}): BioImage => ({
  id,
  url: `https://x/${id}.jpg`,
  thumbnailUrl: null,
  title: null,
  attribution: null,
  license: null,
  licenseUrl: null,
  sourceUrl: null,
  alt: null,
  isPrimary: false,
  displayOrder: null,
  ...overrides,
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

  it('sets the artist name in the Fake Four cutout face, like the video cards', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: 'Test Artist' })).toHaveClass('font-fake-four-cutout');
  });

  it('does not stretch the name link over the card, so the card body is inert', () => {
    render(<ArtistListCard artist={baseArtist} />);

    const name = screen.getByRole('link', { name: 'Test Artist' });
    expect(name).not.toHaveClass('after:absolute');
    expect(name).not.toHaveClass('after:inset-0');
  });

  it('links the images to the artist detail page', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /Test Artist artist page/i })).toHaveAttribute(
      'href',
      '/artists/test-artist'
    );
  });

  it('no longer renders a separate View more link', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByRole('link', { name: /view more/i })).not.toBeInTheDocument();
  });

  it('carries the image, name, latest release, and full-bio links, in that order', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/artists/test-artist',
      '/artists/test-artist',
      '/releases/r3',
      '/artists/test-artist',
      '/artists/test-artist',
    ]);
  });

  it('carries only the image and name links when there is no release and no bio', () => {
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

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders the short bio and up to three genres', () => {
    render(<ArtistListCard artist={{ ...baseArtist, genres: 'hip-hop, soul, jazz, funk' }} />);

    expect(screen.getByText('A short teaser bio.')).toBeInTheDocument();
    expect(screen.getByText('Hip-Hop')).toBeInTheDocument();
    expect(screen.getByText('Soul')).toBeInTheDocument();
    expect(screen.getByText('Jazz')).toBeInTheDocument();
    expect(screen.queryByText('Funk')).not.toBeInTheDocument();
  });

  it('renders a stored genre title-cased, not as the dashed storage form', () => {
    render(<ArtistListCard artist={{ ...baseArtist, genres: 'indie-rock' }} />);

    expect(screen.getByText('Indie Rock')).toBeInTheDocument();
  });

  it('applies the display override to a stored genre', () => {
    render(<ArtistListCard artist={{ ...baseArtist, genres: 'r-and-b' }} />);

    expect(screen.getByText('R&B')).toBeInTheDocument();
  });

  it('renders the credits line as just the newest release and its year', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    expect(container.querySelector('[data-slot="artist-credits"]')).toHaveTextContent(
      'Latest: Third Album (2024)'
    );
  });

  it('offers an all-releases link when the artist has more than one release', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /view all artist releases/i })).toHaveAttribute(
      'href',
      '/artists/test-artist'
    );
  });

  it('withholds the all-releases link when the artist has exactly one release', () => {
    render(
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

    expect(
      screen.queryByRole('link', { name: /view all artist releases/i })
    ).not.toBeInTheDocument();
  });

  it('withholds the all-releases link when the artist has no listed release', () => {
    render(<ArtistListCard artist={{ ...baseArtist, releaseCount: 0, newestRelease: null }} />);

    expect(
      screen.queryByRole('link', { name: /view all artist releases/i })
    ).not.toBeInTheDocument();
  });

  it('sets the all-releases link below the Latest line', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const details = container.querySelector('[data-slot="artist-details"]');
    const slots = [...(details?.children ?? [])].map((child) => child.getAttribute('data-slot'));

    expect(slots.indexOf('artist-all-releases-link')).toBeGreaterThan(
      slots.indexOf('artist-credits')
    );
  });

  it('no longer counts the releases on that line', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    expect(container.querySelector('[data-slot="artist-credits"]')).not.toHaveTextContent(
      /releases?\s·/
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

  it('omits the credits line when the artist has no listed release', () => {
    render(<ArtistListCard artist={{ ...baseArtist, releaseCount: 0, newestRelease: null }} />);

    expect(screen.queryByText(/Latest:/)).not.toBeInTheDocument();
  });

  it('carries no band relationships at all — neither the bands nor the roster', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          memberOf: [name('b1', 'E2E Band'), name('b2', 'Other Band')],
          members: [name('m1', 'E2E Artist'), name('m2', 'Drummer')],
        }}
      />
    );

    expect(screen.queryByText(/Member of|Members:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Other Band/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drummer/)).not.toBeInTheDocument();
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

  it('sets the bio column beside the summary row from lg up, stacked below it before that', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const content = container.querySelector('[data-slot="card-content"]');
    const slots = [...(content?.children ?? [])].map((child) => child.getAttribute('data-slot'));

    expect(slots).toEqual(['artist-summary-row', 'artist-bio-column']);
    expect(content).toHaveClass('flex-col', 'lg:flex-row');
  });

  it('keeps the bio and its full-bio link together in the bio column', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const column = container.querySelector('[data-slot="artist-bio-column"]');

    expect(column?.querySelector('[data-slot="artist-short-bio"]')).toBeInTheDocument();
    expect(column?.querySelector('[data-slot="artist-full-bio-link"]')).toBeInTheDocument();
  });

  it('heads the short bio with a "Short bio" label, below the artist name in rank', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('heading', { name: 'Short bio', level: 3 })).toBeInTheDocument();
  });

  it('omits the Short bio heading when there is no short bio', () => {
    render(<ArtistListCard artist={{ ...baseArtist, shortBio: null }} />);

    expect(screen.queryByRole('heading', { name: 'Short bio' })).not.toBeInTheDocument();
  });

  it('pushes the full-bio link to the right edge of the card', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /view full bio/i })).toHaveClass('self-end');
  });

  it('drops the bio column entirely when there is nothing to put in it', () => {
    const { container } = render(
      <ArtistListCard artist={{ ...baseArtist, shortBio: null, bioImages: [] }} />
    );

    expect(container.querySelector('[data-slot="artist-bio-column"]')).not.toBeInTheDocument();
  });

  it('points the full-bio link at the artist page, where the bio now lives', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByRole('link', { name: /view full bio/i })).toHaveAttribute(
      'href',
      '/artists/test-artist'
    );
  });

  it('omits the full-bio link when the artist has neither a short bio nor images', () => {
    render(<ArtistListCard artist={{ ...baseArtist, shortBio: null, bioImages: [] }} />);

    expect(screen.queryByRole('link', { name: /view full bio/i })).not.toBeInTheDocument();
  });

  it('inks the short bio dark enough to clear AA on the white card', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const bio = container.querySelector('[data-slot="artist-short-bio"]');

    // zinc-600 (#52525b) on white is 7.73:1; the muted token it replaced was
    // #71717b at 4.83:1 — passing AA, but with no margin at all.
    expect(bio?.firstElementChild).toHaveClass('text-zinc-600');
    expect(bio?.firstElementChild).not.toHaveClass('text-muted-foreground');
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

    expect(screen.getByRole('img', { name: 'Portrait' })).toBeInTheDocument();
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

    expect(screen.getByRole('img', { name: 'Test Artist on stage' })).toBeInTheDocument();
  });

  it('no longer opens an image dialog from the card', () => {
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
              alt: null,
              isPrimary: false,
              displayOrder: null,
            },
          ],
        }}
      />
    );

    expect(screen.queryByRole('button', { name: /expand image/i })).not.toBeInTheDocument();
  });

  it('shows one photo only, however many display images the row carries', () => {
    render(
      <ArtistListCard
        artist={{
          ...baseArtist,
          bioImages: [
            bioImage('bi1', { alt: 'First' }),
            bioImage('bi2', { alt: 'Second' }),
            bioImage('bi3', { alt: 'Third' }),
          ],
        }}
      />
    );

    // The listing row arrives already resolved — chosen, else suggested, else
    // pool order — so the first row is the one photo worth showing.
    const photos = screen.getAllByRole('img');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toHaveAccessibleName('First');
  });

  it('sets the gap right of the image to the card’s own 24px side padding', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    expect(container.querySelector('[data-slot="artist-summary-row"]')).toHaveClass('sm:gap-6');
  });

  it('sizes the thumbnail frame to sit level with the details beside it', () => {
    const { container } = render(
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
              alt: null,
              isPrimary: false,
              displayOrder: null,
            },
          ],
        }}
      />
    );

    const frame = container.querySelector('[data-slot="artist-thumbnails"] > span');
    expect(frame).toHaveClass('size-32', 'sm:size-36');
  });

  it('shows a placeholder icon when there are no images', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('links the placeholder to the artist page too, so it is never a dead target', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const placeholder = container.querySelector('.bg-muted');
    const imageLink = screen.getByRole('link', { name: /Test Artist artist page/i });

    expect(imageLink).toContainElement(placeholder as HTMLElement | null);
  });

  it('styles the card as a punk photo card without the soft hover shadow', () => {
    const { container } = render(<ArtistListCard artist={baseArtist} />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('shadow-zine-sm', 'bg-white');
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
