/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import {
  buildArtistPageModel,
  type ArtistPageSource,
  type LatestReleaseSourceRow,
} from '@/lib/services/artist-page-model';
import type { ArtistPageBioImageRecord } from '@/lib/types/domain/artist';

import ArtistDetailPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));

// Like Next's own, the mock throws: nothing after a `notFound()` runs.
const notFound = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  notFound: () => {
    notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getPublicArtist = vi.hoisted(() => vi.fn());
vi.mock('./get-public-artist', () => ({
  getPublicArtist: (slug: string) => getPublicArtist(slug),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/app/components/ui/zine-panel', () => ({
  ZinePanel: ({
    children,
    breadcrumbs,
  }: {
    children: React.ReactNode;
    breadcrumbs?: { anchorText: string }[];
  }) => (
    <div
      data-testid="zine-panel"
      data-breadcrumbs={breadcrumbs?.map((b) => b.anchorText).join('>')}
    >
      {children}
    </div>
  ),
}));

// The two client islands have their own specs; here only what they receive matters.
vi.mock('@/app/components/display-image-collage', () => ({
  DisplayImageCollage: ({
    images,
    displayName,
  }: {
    images: { id: string }[];
    displayName: string;
  }) => (
    <div
      data-testid="collage"
      data-ids={images.map(({ id }) => id).join(',')}
      data-display-name={displayName}
    />
  ),
}));

vi.mock('@/app/components/latest-release-play-link', () => ({
  LatestReleasePlayLink: ({
    release,
    slug,
  }: {
    release: { id: string; byName: string | null };
    slug: string;
  }) => (
    <div
      data-testid="latest-release"
      data-release-id={release.id}
      data-by-name={release.byName ?? ''}
      data-slug={slug}
    />
  ),
}));

const params = Promise.resolve({ slug: 'marguerite-ash' });

const PUBLISHED = new Date('2024-01-01T00:00:00.000Z');

const image = (
  id: string,
  displayOrder: number | null,
  overrides: Partial<ArtistPageBioImageRecord> = {}
): ArtistPageBioImageRecord => ({
  id,
  url: `https://cdn.example/${id}.jpg`,
  thumbnailUrl: null,
  alt: `${id} described`,
  title: null,
  attribution: null,
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
  isPrimary: false,
  displayOrder,
  ...overrides,
});

/** A credited artist, public unless its publication is cleared. */
const credit = (id: string, displayName: string, publishedOn: Date | null = PUBLISHED) => ({
  artistId: id,
  artist: {
    id,
    firstName: displayName,
    surname: '',
    displayName,
    slug: id,
    publishedOn,
    deletedOn: null,
  },
});

const SELF = credit('marguerite', 'Marguerite Ash');

/** A listed release join row with an MP3 track, its credits in stored order. */
const releaseRow = (id: string, credits = [SELF]): LatestReleaseSourceRow => ({
  release: {
    id,
    title: `Release ${id}`,
    releasedOn: new Date('2024-01-01'),
    publishedAt: PUBLISHED,
    deletedOn: null,
    digitalFormats: [{ files: [{ s3Key: `releases/${id}/tracks/01.mp3` }] }],
    artistReleases: credits,
  },
});

/** The detail read of a public artist with three images, one of them only pooled. */
const source = (overrides: Partial<ArtistPageSource> = {}): ArtistPageSource => ({
  id: 'marguerite',
  displayName: 'Marguerite Ash',
  firstName: 'Marguerite',
  middleName: null,
  surname: 'Ash',
  title: null,
  suffix: null,
  slug: 'marguerite-ash',
  genres: 'experimental,noise-rock',
  links: null,
  bio: '<p>Born in a van.</p>',
  shortBio: '<p>A <b>genre-blurring</b> act.</p>',
  bioImages: [image('pool', null), image('second', 1), image('first', 0)],
  releases: [],
  memberOf: [],
  ...overrides,
});

/** Render the page over the artist page model the module builds from `overrides`. */
const renderPage = async (overrides: Partial<ArtistPageSource> = {}) => {
  getPublicArtist.mockResolvedValueOnce(buildArtistPageModel(source(overrides)));
  render(await ArtistDetailPage({ params }));
};

describe('ArtistDetailPage', () => {
  it('shows 404 when there is no public artist', async () => {
    getPublicArtist.mockResolvedValueOnce(null);

    await expect(ArtistDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
  });

  it('is headed by the artist, under the artists breadcrumb', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marguerite Ash');
    expect(screen.getByTestId('zine-panel')).toHaveAttribute(
      'data-breadcrumbs',
      'Artists>Marguerite Ash'
    );
  });

  it('keeps the breadcrumb trail above the layout grid, not inside it', async () => {
    await renderPage();

    // The panel renders its trail before its children; the grid is the one
    // child, so the trail can never be auto-placed into a spare grid cell.
    const grid = screen.getByTestId('zine-panel').firstElementChild;
    expect(grid).toHaveClass('grid');
    expect(grid).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(grid).toContainElement(screen.getByTestId('collage'));
    expect(grid).toContainElement(screen.getByRole('article', { name: 'Biography' }));
  });

  it('drops the collage to the cap line of the name on desktop', async () => {
    await renderPage();

    expect(screen.getByTestId('collage').parentElement).toHaveClass('lg:pt-4');
  });

  it('hands the collage the display images in their chosen order', async () => {
    await renderPage();

    const collage = screen.getByTestId('collage');
    expect(collage).toHaveAttribute('data-ids', 'first,second');
    expect(collage).toHaveAttribute('data-display-name', 'Marguerite Ash');
  });

  // A grandfathered artist with nothing chosen keeps the ADR-0008 fallback.
  it('hands the collage the suggested images with alt text when nothing is chosen', async () => {
    await renderPage({
      bioImages: [
        image('pool', null),
        image('bare', null, { isPrimary: true, alt: null }),
        image('suggested', null, { isPrimary: true }),
      ],
    });

    expect(screen.getByTestId('collage')).toHaveAttribute('data-ids', 'suggested');
  });

  it('leads with the latest release', async () => {
    await renderPage({ releases: [releaseRow('r1')] });

    const latest = screen.getByTestId('latest-release');
    expect(latest).toHaveAttribute('data-release-id', 'r1');
    expect(latest).toHaveAttribute('data-slug', 'marguerite-ash');
  });

  it('names no album artist on a release of their own', async () => {
    await renderPage({ releases: [releaseRow('r1')] });

    expect(screen.getByTestId('latest-release')).toHaveAttribute('data-by-name', '');
  });

  it('says the latest release is by its album artist when the artist is only featured', async () => {
    await renderPage({ releases: [releaseRow('guest', [credit('ceschi', 'Ceschi'), SELF])] });

    expect(screen.getByTestId('latest-release')).toHaveAttribute('data-by-name', 'Ceschi');
  });

  it('names no album artist when that artist is hidden', async () => {
    await renderPage({
      releases: [releaseRow('guest', [credit('hidden', 'Hidden', null), SELF])],
    });

    expect(screen.getByTestId('latest-release')).toHaveAttribute('data-by-name', '');
  });

  it('says when there is no release yet, with nothing to view', async () => {
    await renderPage({ releases: [], memberOf: [] });

    expect(screen.getByText('No releases yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('latest-release')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View all releases' })).not.toBeInTheDocument();
  });

  it('leads a member with only band releases to them', async () => {
    await renderPage({
      memberOf: [
        {
          artist: {
            publishedOn: PUBLISHED,
            deletedOn: null,
            releases: [releaseRow('band-lp', [credit('band', 'The Band')])],
          },
        },
      ],
    });

    expect(screen.getByText('No releases of their own yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('latest-release')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all releases' })).toHaveAttribute(
      'href',
      '/releases?artist=marguerite-ash'
    );
  });

  it('lists the genres, formatted', async () => {
    await renderPage();

    const genres = screen.getByRole('list', { name: 'Genres' });
    expect(
      within(genres)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Experimental', 'Noise Rock']);
  });

  it('shows the link sections that have links and none of the others', async () => {
    await renderPage({
      links: {
        websites: [{ label: null, url: 'https://margueriteash.example.com' }],
        social: [],
        contact: [
          {
            heading: 'Booking',
            links: [{ label: null, description: null, url: 'mailto:a@example.com' }],
          },
        ],
      },
    });

    expect(screen.getByRole('region', { name: 'Websites' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contact & Misc' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Social Media' })).not.toBeInTheDocument();
  });

  it('shows a contact link’s description in Contact & Misc', async () => {
    await renderPage({
      links: {
        websites: [],
        social: [],
        contact: [
          {
            heading: 'Booking',
            links: [{ label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' }],
          },
        ],
      },
    });

    expect(
      within(screen.getByRole('region', { name: 'Contact & Misc' })).getByText('Books US tours')
    ).toBeInTheDocument();
  });

  it('shows no link section for an artist without links', async () => {
    await renderPage({ links: null });

    expect(screen.queryByRole('region', { name: 'Websites' })).not.toBeInTheDocument();
  });

  it('carries the biography on the page, without the short-bio teaser', async () => {
    await renderPage();

    expect(screen.getByRole('article', { name: 'Biography' })).toHaveTextContent('Born in a van.');
    expect(screen.queryByText(/genre-blurring/)).not.toBeInTheDocument();
  });

  describe('generateMetadata', () => {
    it('titles the page with the artist and describes it with the short bio as text', async () => {
      getPublicArtist.mockResolvedValueOnce(buildArtistPageModel(source()));

      expect(await generateMetadata({ params })).toEqual({
        title: 'Marguerite Ash',
        description: 'A genre-blurring act.',
      });
    });

    it('falls back to a listening line without a short bio', async () => {
      getPublicArtist.mockResolvedValueOnce(buildArtistPageModel(source({ shortBio: null })));

      expect(await generateMetadata({ params })).toMatchObject({
        description: 'Listen to releases by Marguerite Ash.',
      });
    });

    it('titles a missing artist as not found', async () => {
      getPublicArtist.mockResolvedValueOnce(null);

      expect(await generateMetadata({ params })).toEqual({ title: 'Artist Not Found' });
    });
  });
});
