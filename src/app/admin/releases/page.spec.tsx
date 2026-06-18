/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import ReleasesPage from './page';

vi.mock('../data-views/release-data-view', () => ({
  ReleaseDataView: () => <div data-testid="release-data-view">releases</div>,
}));

describe('ReleasesPage', () => {
  it('renders the Releases section header', () => {
    render(<ReleasesPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Releases' })).toBeInTheDocument();
  });

  it('renders the releases data view', () => {
    render(<ReleasesPage />);

    expect(screen.getByTestId('release-data-view')).toBeInTheDocument();
  });

  it('renders a breadcrumb back to Admin', () => {
    render(<ReleasesPage />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
