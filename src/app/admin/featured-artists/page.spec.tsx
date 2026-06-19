/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import FeaturedArtistsPage from './page';

vi.mock('../data-views/featured-artist-data-view', () => ({
  FeaturedArtistDataView: () => <div data-testid="featured-artist-data-view">featured</div>,
}));

describe('FeaturedArtistsPage', () => {
  it('renders the Featured Artists section header', () => {
    render(<FeaturedArtistsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Featured Artists' })).toBeInTheDocument();
  });

  it('renders the featured artists data view (list, not a create form)', () => {
    render(<FeaturedArtistsPage />);

    expect(screen.getByTestId('featured-artist-data-view')).toBeInTheDocument();
  });

  it('renders a breadcrumb back to Admin', () => {
    render(<FeaturedArtistsPage />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
