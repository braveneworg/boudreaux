/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { artistWithPublishedReleases } from '@/lib/validation/media/schema-fixtures';

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

vi.mock('@/app/components/latest-release-link', () => ({
  LatestReleaseLink: ({
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

const image = (id: string, displayOrder: number | null) => ({
  ...artistWithPublishedReleases.bioImages[0],
  id,
  url: `https://cdn.example/${id}.jpg`,
  alt: `${id} described`,
  isPrimary: false,
  displayOrder,
});

const graph = (overrides: Partial<ArtistWithPublishedReleases> = {}): ArtistWithPublishedReleases =>
  ({
    ...artistWithPublishedReleases,
    displayName: 'Marguerite Ash',
    shortBio: '<p>A <b>genre-blurring</b> act.</p>',
    bio: '<p>Born in a van.</p>',
    genres: 'experimental,noise-rock',
    bioImages: [image('pool', null), image('second', 1), image('first', 0)],
    links: null,
    newestRelease: null,
    ...overrides,
  }) as ArtistWithPublishedReleases;

const renderPage = async (overrides: Partial<ArtistWithPublishedReleases> = {}) => {
  getPublicArtist.mockResolvedValueOnce(graph(overrides));
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

  it('leads with the latest release', async () => {
    await renderPage({
      newestRelease: { id: 'r1', title: 'Release', releasedOn: new Date('2024-01-01') },
    });

    const latest = screen.getByTestId('latest-release');
    expect(latest).toHaveAttribute('data-release-id', 'r1');
    expect(latest).toHaveAttribute('data-slug', 'marguerite-ash');
  });

  it('says when there is no release yet', async () => {
    await renderPage({ newestRelease: null });

    expect(screen.getByText('No releases yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('latest-release')).not.toBeInTheDocument();
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
      getPublicArtist.mockResolvedValueOnce(graph());

      expect(await generateMetadata({ params })).toEqual({
        title: 'Marguerite Ash',
        description: 'A genre-blurring act.',
      });
    });

    it('falls back to a listening line without a short bio', async () => {
      getPublicArtist.mockResolvedValueOnce(graph({ shortBio: null }));

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
