/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ToursPage from './page';

// Mock getInternalApiUrl to return predictable URLs
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => Promise.resolve(`http://test-host${path}`)),
}));

// Mock child component
vi.mock('./components/tours-page-client', () => ({
  ToursPageClient: ({ tours }: { tours: Array<{ id: string }> }) => (
    <div data-testid="tours-page-client" data-tour-count={tours.length}>
      Tours Client
    </div>
  ),
}));

describe('ToursPage', () => {
  const mockTours = [
    { id: 'tour-1', name: 'Summer Tour', tourDates: [] },
    { id: 'tour-2', name: 'Winter Tour', tourDates: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tours: mockTours }),
    }) as unknown as typeof fetch;
  });

  it('should render page structure with heading', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByRole('heading', { name: 'Tours' })).toBeInTheDocument();
    expect(
      screen.getByText('Search and browse upcoming and recent tour dates')
    ).toBeInTheDocument();
  });

  it('should fetch tours via internal API', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith('http://test-host/api/tours', { cache: 'no-store' });
  });

  it('should pass fetched tours to ToursPageClient', async () => {
    const Page = await ToursPage();
    render(Page);

    const client = screen.getByTestId('tours-page-client');
    expect(client).toHaveAttribute('data-tour-count', '2');
  });

  it('should render empty tours when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const Page = await ToursPage();
    render(Page);

    const client = screen.getByTestId('tours-page-client');
    expect(client).toHaveAttribute('data-tour-count', '0');
  });

  it('should render empty tours when response has no tours key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const Page = await ToursPage();
    render(Page);

    const client = screen.getByTestId('tours-page-client');
    expect(client).toHaveAttribute('data-tour-count', '0');
  });
});
