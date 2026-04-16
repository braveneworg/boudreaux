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

describe('ArtistDataView', () => {
  it('renders loading state when isPending is true', () => {
    mockUseArtistsQuery.mockReturnValue({
      isPending: true,
      error: null,
      data: undefined,
      refetch: vi.fn(),
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Loading artists...')).toBeInTheDocument();
  });

  it('renders error state when error is truthy', () => {
    mockUseArtistsQuery.mockReturnValue({
      isPending: false,
      error: new Error('Fetch failed'),
      data: undefined,
      refetch: vi.fn(),
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Error loading artists')).toBeInTheDocument();
  });

  it('renders DataView when data is loaded successfully', () => {
    const mockData = [{ id: '1', firstName: 'John', surname: 'Doe' }];
    mockUseArtistsQuery.mockReturnValue({
      isPending: false,
      error: null,
      data: mockData,
      refetch: vi.fn(),
    });

    render(<ArtistDataView />);
    expect(screen.getByTestId('data-view')).toBeInTheDocument();
  });

  it('prioritizes error state over pending state', () => {
    mockUseArtistsQuery.mockReturnValue({
      isPending: true,
      error: new Error('Error'),
      data: undefined,
      refetch: vi.fn(),
    });

    render(<ArtistDataView />);
    expect(screen.getByText('Error loading artists')).toBeInTheDocument();
    expect(screen.queryByText('Loading artists...')).not.toBeInTheDocument();
  });
});
