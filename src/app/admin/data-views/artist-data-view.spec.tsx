/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistDataView } from './artist-data-view';

const mockUseArtistsQuery = vi.fn();
vi.mock('@/app/hooks/use-artists-query', () => ({
  useArtistsQuery: () => mockUseArtistsQuery(),
}));

vi.mock('./data-view', () => ({
  DataView: (props: Record<string, unknown>) => (
    <div
      data-testid="data-view"
      data-entity={String(props.entity)}
      data-image-field={String(props.imageField)}
    >
      DataView
    </div>
  ),
}));

const baseInfiniteResult = {
  isPending: false,
  error: null,
  data: { pages: [{ rows: [], nextSkip: null }] },
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

describe('ArtistDataView', () => {
  it('renders loading state when isPending is true', () => {
    mockUseArtistsQuery.mockReturnValue({
      ...baseInfiniteResult,
      isPending: true,
      data: undefined,
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Loading artists...')).toBeInTheDocument();
  });

  it('renders error state when error is truthy', () => {
    mockUseArtistsQuery.mockReturnValue({
      ...baseInfiniteResult,
      error: new Error('Fetch failed'),
      data: undefined,
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Error loading artists')).toBeInTheDocument();
  });

  it('renders DataView when data is loaded successfully', () => {
    mockUseArtistsQuery.mockReturnValue({
      ...baseInfiniteResult,
      data: {
        pages: [{ rows: [{ id: '1', firstName: 'John', surname: 'Doe' }], nextSkip: null }],
      },
    });

    render(<ArtistDataView />);
    expect(screen.getByTestId('data-view')).toBeInTheDocument();
  });

  it('prioritizes error state over pending state', () => {
    mockUseArtistsQuery.mockReturnValue({
      ...baseInfiniteResult,
      isPending: true,
      error: new Error('Error'),
      data: undefined,
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Error loading artists')).toBeInTheDocument();
    expect(screen.queryByText('Loading artists...')).not.toBeInTheDocument();
  });
});
