/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ReleaseDetailContent } from './release-detail-content';

const mockUseReleaseQuery = vi.fn();
vi.mock('@/hooks/use-release-query', () => ({
  useReleaseQuery: (releaseId: string) => mockUseReleaseQuery(releaseId),
}));

const mockUseReleaseUserStatusQuery = vi.fn();
vi.mock('@/hooks/use-release-user-status-query', () => ({
  useReleaseUserStatusQuery: (releaseId: string) => mockUseReleaseUserStatusQuery(releaseId),
}));

const mockUseReleaseDigitalFormatsQuery = vi.fn();
vi.mock('@/hooks/use-release-digital-formats-query', () => ({
  useReleaseDigitalFormatsQuery: (releaseId: string) =>
    mockUseReleaseDigitalFormatsQuery(releaseId),
}));

const mockUseReleaseRelatedQuery = vi.fn();
vi.mock('@/hooks/use-release-related-query', () => ({
  useReleaseRelatedQuery: (releaseId: string, artistId: string | null) =>
    mockUseReleaseRelatedQuery(releaseId, artistId),
}));

vi.mock('./artist-releases-carousel', () => ({
  ArtistReleasesCarousel: () => <div data-testid="artist-releases-carousel" />,
}));

vi.mock('./release-notes', () => ({
  ReleaseNotes: () => <div data-testid="release-notes" />,
}));

vi.mock('./release-player', () => ({
  ReleasePlayer: () => <div data-testid="release-player" />,
}));

vi.mock('./ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <nav data-testid="breadcrumb-menu" />,
}));

const mockRelease = {
  id: 'release-1',
  title: 'Test Album',
  description: 'A test album description',
  artistReleases: [
    {
      artist: {
        id: 'artist-1',
        displayName: null,
        firstName: 'John',
        middleName: null,
        surname: 'Doe',
        title: null,
        suffix: null,
      },
    },
  ],
};

describe('ReleaseDetailContent', () => {
  beforeEach(() => {
    mockUseReleaseQuery.mockReturnValue({ isPending: false, data: mockRelease });
    mockUseReleaseRelatedQuery.mockReturnValue({
      data: { releases: [{ id: 'release-2', title: 'Other Album' }] },
    });
  });

  it('should render a spinner without a zine panel while the release is pending', () => {
    mockUseReleaseQuery.mockReturnValue({ isPending: true, data: undefined });

    const { container } = render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="zine-panel"]')).not.toBeInTheDocument();
  });

  it('should render the not-found state without a zine panel', () => {
    mockUseReleaseQuery.mockReturnValue({ isPending: false, data: undefined });

    const { container } = render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    expect(screen.getByText('Release not found')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="zine-panel"]')).not.toBeInTheDocument();
  });

  it('should wrap the success content in a cyan zine panel', () => {
    const { container } = render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-cyan');
    expect(panel).toContainElement(screen.getByTestId('artist-releases-carousel'));
    expect(panel).toContainElement(screen.getByTestId('release-player'));
    expect(panel).toContainElement(screen.getByTestId('release-notes'));
  });

  it('should render the detail panel without a tape strip', () => {
    const { container } = render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    // ZinePanel renders the tape as its only aria-hidden span; tape={false} removes it.
    expect(panel?.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('should render the breadcrumb menu inside the zine panel', () => {
    const { container } = render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toContainElement(screen.getByTestId('breadcrumb-menu'));
  });

  it('should omit the artist releases carousel when there are no related releases', () => {
    mockUseReleaseRelatedQuery.mockReturnValue({ data: { releases: [] } });

    render(<ReleaseDetailContent releaseId="release-1" autoPlay={false} />);

    expect(screen.queryByTestId('artist-releases-carousel')).not.toBeInTheDocument();
  });
});
