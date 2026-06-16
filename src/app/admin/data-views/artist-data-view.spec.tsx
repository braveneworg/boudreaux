/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, fireEvent } from '@testing-library/react';

import { ArtistDataView } from './artist-data-view';

const mockUseArtistsQuery = vi.fn();
vi.mock('@/app/hooks/use-artists-query', () => ({
  useArtistsQuery: (...args: unknown[]) => mockUseArtistsQuery(...args),
}));

vi.mock('./data-view', () => ({
  DataView: (props: Record<string, unknown>) => (
    <div
      data-testid="data-view"
      data-entity={String(props.entity)}
      data-image-field={String(props.imageField)}
    >
      DataView
      <button
        type="button"
        data-testid="toggle-unpublished"
        onClick={() => (props.onShowUnpublishedChange as (value: boolean) => void)(false)}
      >
        toggle unpublished
      </button>
    </div>
  ),
}));

const baseInfiniteResult = {
  isPending: false,
  isFetching: false,
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

  it('passes a published filter to the query when the publish toggles differ', () => {
    mockUseArtistsQuery.mockReturnValue(baseInfiniteResult);

    render(<ArtistDataView />);
    fireEvent.click(screen.getByTestId('toggle-unpublished'));

    expect(mockUseArtistsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ published: true })
    );
  });
});
