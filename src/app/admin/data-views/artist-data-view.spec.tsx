/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { archiveArtistAction } from '@/lib/actions/archive-artist-action';
import { publishArtistAction } from '@/lib/actions/publish-artist-action';
import { restoreArtistAction } from '@/lib/actions/restore-artist-action';

import { ArtistDataView } from './artist-data-view';

/**
 * Wraps renders in a fresh QueryClient so the mutation hooks the wrapper now
 * uses (publish/archive/restore) have a provider in scope. Mirrors the
 * `render` signature so existing call sites are unchanged.
 */
const render = (ui: ReactNode) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return rtlRender(ui, { wrapper: Wrapper });
};

const mockUseArtistsQuery = vi.fn();
vi.mock('@/app/hooks/use-infinite-artists-query', () => ({
  useInfiniteArtistsQuery: (...args: unknown[]) => mockUseArtistsQuery(...args),
}));

// Mock the artist mutation actions so the real mutation hooks resolve without
// executing server code; lets us assert the wrapper maps DataView's `id` to the
// `{ artistId }` shape each action expects.
vi.mock('@/lib/actions/publish-artist-action', () => ({
  publishArtistAction: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock('@/lib/actions/archive-artist-action', () => ({
  archiveArtistAction: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock('@/lib/actions/restore-artist-action', () => ({
  restoreArtistAction: vi.fn(() => Promise.resolve({ success: true })),
}));

type EntityMutation = (id: string) => Promise<{ success: boolean; error?: string }>;
type EntityMutations = {
  publish: EntityMutation;
  delete: EntityMutation;
  restore?: EntityMutation;
};
type DataViewFilters = { onShowUnpublishedChange: (value: boolean) => void };

// DataView is mocked to a stub exposing the injected mutation callbacks as
// buttons, so the wrapper's `(id) => xAsync({ artistId: id })` arrows execute.
vi.mock('./data-view', () => ({
  DataView: (props: Record<string, unknown>) => {
    const mutations = props.mutations as EntityMutations;
    const filters = props.filters as DataViewFilters;
    return (
      <div
        data-testid="data-view"
        data-entity={String(props.entity)}
        data-image-field={String(props.imageField)}
      >
        DataView
        <button
          type="button"
          data-testid="toggle-unpublished"
          onClick={() => filters.onShowUnpublishedChange(false)}
        >
          toggle unpublished
        </button>
        <input
          type="checkbox"
          role="switch"
          aria-label="Show deleted"
          checked={filters.showDeleted as boolean}
          onChange={(e) => filters.onShowDeletedChange(e.target.checked)}
        />
        <button
          type="button"
          data-testid="invoke-publish"
          onClick={() => void mutations.publish('artist-1')}
        >
          publish
        </button>
        <button
          type="button"
          data-testid="invoke-delete"
          onClick={() => void mutations.delete('artist-1')}
        >
          delete
        </button>
        <button
          type="button"
          data-testid="invoke-restore"
          onClick={() => void mutations.restore?.('artist-1')}
        >
          restore
        </button>
      </div>
    );
  },
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
      expect.objectContaining({ published: true }),
      expect.objectContaining({ enabled: true })
    );
  });

  it('maps DataView ids to the artist mutation actions', async () => {
    mockUseArtistsQuery.mockReturnValue(baseInfiniteResult);

    render(<ArtistDataView />);
    fireEvent.click(screen.getByTestId('invoke-publish'));
    fireEvent.click(screen.getByTestId('invoke-delete'));
    fireEvent.click(screen.getByTestId('invoke-restore'));

    await waitFor(() => {
      expect(publishArtistAction).toHaveBeenCalledWith('artist-1');
      expect(archiveArtistAction).toHaveBeenCalledWith('artist-1');
      expect(restoreArtistAction).toHaveBeenCalledWith('artist-1');
    });
  });

  it('restores filter state across unmount and remount', async () => {
    mockUseArtistsQuery.mockReturnValue(baseInfiniteResult);
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    const { unmount } = render(<ArtistDataView />);
    await user.click(screen.getByRole('switch', { name: /show deleted/i }));
    expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();

    unmount();
    render(<ArtistDataView />);

    expect(screen.getByRole('switch', { name: /show deleted/i })).toBeChecked();
  });
});
