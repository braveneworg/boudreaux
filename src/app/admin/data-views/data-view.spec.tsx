/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ComponentProps } from 'react';

import { render, screen } from '@testing-library/react';

import { ENTITIES } from '@/lib/constants';

import { DataView } from './data-view';

type DataViewProps = ComponentProps<typeof DataView>;

/** Renders DataView for the `artist` entity with overridable, list-friendly defaults. */
const renderDataView = (overrides: Partial<DataViewProps> = {}) =>
  render(
    <DataView
      entity={ENTITIES.artist}
      data={{ artists: [] }}
      fieldsToShow={['firstName']}
      refetch={vi.fn()}
      isPending={false}
      searchValue=""
      onSearchChange={vi.fn()}
      showPublished
      onShowPublishedChange={vi.fn()}
      showUnpublished
      onShowUnpublishedChange={vi.fn()}
      showDeleted={false}
      onShowDeletedChange={vi.fn()}
      {...overrides}
    />
  );

describe('DataView refresh overlay', () => {
  it('renders the overlay while the query is fetching', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByTestId('data-view-overlay')).toBeInTheDocument();
  });

  it('does not render the overlay when the query is idle', () => {
    renderDataView({ isFetching: false });
    expect(screen.queryByTestId('data-view-overlay')).not.toBeInTheDocument();
  });

  it('keeps the underlying content mounted beneath the overlay while fetching', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('keeps the overlay hidden while paging in more items', () => {
    renderDataView({ isFetching: true, isFetchingNextPage: true, fetchNextPage: vi.fn() });
    expect(screen.queryByTestId('data-view-overlay')).not.toBeInTheDocument();
  });

  it('labels the overlay region for assistive technology', () => {
    renderDataView({ isFetching: true });
    expect(screen.getByRole('status', { name: 'Loading artists' })).toBeInTheDocument();
  });
});
