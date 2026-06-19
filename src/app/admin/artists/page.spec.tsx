/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import ArtistsPage from './page';

vi.mock('../data-views/artist-data-view', () => ({
  ArtistDataView: () => <div data-testid="artist-data-view">artists</div>,
}));

describe('ArtistsPage', () => {
  it('renders the Artists section header', () => {
    render(<ArtistsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Artists' })).toBeInTheDocument();
  });

  it('renders the artists data view (list, not a create form)', () => {
    render(<ArtistsPage />);

    expect(screen.getByTestId('artist-data-view')).toBeInTheDocument();
  });

  it('renders a breadcrumb back to Admin', () => {
    render(<ArtistsPage />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
