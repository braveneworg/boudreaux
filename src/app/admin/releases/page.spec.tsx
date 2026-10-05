/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import ReleasesPage from './page';

vi.mock('../data-views/release-data-view', () => ({
  ReleaseDataView: ({ withoutByline }: { withoutByline?: boolean }) => (
    <div data-testid="release-data-view" data-without-byline={String(Boolean(withoutByline))}>
      releases
    </div>
  ),
}));

const renderPage = async (searchParams: Record<string, string> = {}): Promise<void> => {
  render(await ReleasesPage({ searchParams: Promise.resolve(searchParams) }));
};

describe('ReleasesPage', () => {
  it('renders the Releases section header', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Releases' })).toBeInTheDocument();
  });

  it('renders the releases data view', async () => {
    await renderPage();

    expect(screen.getByTestId('release-data-view')).toBeInTheDocument();
  });

  it('renders a breadcrumb back to Admin', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  // The dashboard's byline warning links to `?byline=missing`.
  it('shows the releases without a byline when the link asks for them', async () => {
    await renderPage({ byline: 'missing' });

    expect(screen.getByTestId('release-data-view')).toHaveAttribute('data-without-byline', 'true');
  });

  it('shows every release for any other byline value', async () => {
    await renderPage({ byline: 'present' });

    expect(screen.getByTestId('release-data-view')).toHaveAttribute('data-without-byline', 'false');
  });
});
