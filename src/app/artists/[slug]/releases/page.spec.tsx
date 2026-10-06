/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import type { ReleaseCredit } from '@/lib/types/domain/release';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { artistWithPublishedReleases, release } from '@/lib/validation/media/schema-fixtures';

import ArtistReleasesPage, { generateMetadata } from './page';

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
vi.mock('../get-public-artist', () => ({
  getPublicArtist: (slug: string) => getPublicArtist(slug),
}));

vi.mock('@/app/components/ui/zine-panel', () => ({
  ZinePanel: ({
    children,
    breadcrumbs,
  }: {
    children: React.ReactNode;
    breadcrumbs?: { anchorText: string; url: string }[];
  }) => (
    <div
      data-testid="zine-panel"
      data-breadcrumbs={breadcrumbs?.map((b) => b.anchorText).join('>')}
    >
      {children}
    </div>
  ),
}));

vi.mock('@/app/components/release-card', () => ({
  ReleaseCard: ({
    title,
    playSrc,
    artistName,
  }: {
    title: string;
    playSrc: string | null;
    artistName: string | null;
  }) => (
    <div data-testid="release-card" data-title={title} data-playable={String(playSrc !== null)}>
      {title}
      {artistName ? ` by ${artistName}` : ''}
    </div>
  ),
}));

const params = Promise.resolve({ slug: 'marguerite-ash' });

type Row = ArtistWithPublishedReleases['releases'][number];

const row = (id: string, credit: ReleaseCredit, overrides: Partial<Row['release']> = {}): Row =>
  ({
    ...artistWithPublishedReleases.releases[0],
    id: `ar-${id}`,
    releaseId: id,
    credit,
    release: { ...release, id, title: `Release ${id}`, ...overrides },
  }) as Row;

describe('ArtistReleasesPage', () => {
  it('shows 404 when there is no public artist', async () => {
    getPublicArtist.mockResolvedValueOnce(null);

    await expect(ArtistReleasesPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
  });

  it('is headed by the artist and lists every release credit as a card', async () => {
    getPublicArtist.mockResolvedValueOnce({
      ...artistWithPublishedReleases,
      displayName: 'Marguerite Ash',
      releases: [row('a', 'primary'), row('b', 'primary')],
    });

    render(await ArtistReleasesPage({ params }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marguerite Ash');
    expect(screen.getByTestId('zine-panel')).toHaveAttribute(
      'data-breadcrumbs',
      'Artists>Marguerite Ash>Releases'
    );
    expect(screen.getAllByTestId('release-card').map((card) => card.dataset.title)).toEqual([
      'Release a',
      'Release b',
    ]);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('groups the cards under a heading per credit when there is more than one kind', async () => {
    getPublicArtist.mockResolvedValueOnce({
      ...artistWithPublishedReleases,
      releases: [row('own', 'primary'), row('guest', 'featured'), row('band', 'member')],
    });

    render(await ArtistReleasesPage({ params }));

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Own releases', 'Featured on', 'With the band']);
    const featured = screen.getByRole('region', { name: 'Featured on' });
    expect(within(featured).getByTestId('release-card')).toHaveAttribute(
      'data-title',
      'Release guest'
    );
  });

  it('lists an unplayable release too, with Play disabled', async () => {
    getPublicArtist.mockResolvedValueOnce({
      ...artistWithPublishedReleases,
      releases: [row('silent', 'primary', { digitalFormats: [] })],
    });

    render(await ArtistReleasesPage({ params }));

    expect(screen.getByTestId('release-card')).toHaveAttribute('data-playable', 'false');
  });

  it('says so when the artist has no release yet', async () => {
    getPublicArtist.mockResolvedValueOnce({ ...artistWithPublishedReleases, releases: [] });

    render(await ArtistReleasesPage({ params }));

    expect(screen.getByText('No releases yet.')).toBeInTheDocument();
  });

  describe('generateMetadata', () => {
    it('titles the page with the artist', async () => {
      getPublicArtist.mockResolvedValueOnce({
        ...artistWithPublishedReleases,
        displayName: 'Marguerite Ash',
      });

      expect(await generateMetadata({ params })).toMatchObject({
        title: 'Marguerite Ash – Releases',
      });
    });

    it('titles a missing artist as not found', async () => {
      getPublicArtist.mockResolvedValueOnce(null);

      expect(await generateMetadata({ params })).toEqual({ title: 'Artist Not Found' });
    });
  });
});
