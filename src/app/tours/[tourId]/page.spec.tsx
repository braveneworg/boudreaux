/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import TourPage from './page';

vi.mock('server-only', () => ({}));

// Mock notFound — must throw to stop execution like the real notFound
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock TanStack Query SSR utilities
const mockSetQueryData = vi.fn();
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
}));

vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

// Mock child component
vi.mock('../components/tour-detail-content', () => ({
  TourDetailContent: ({ tourId }: { tourId: string }) => (
    <div data-testid="tour-detail-content" data-tour-id={tourId}>
      Tour Detail Content
    </div>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TourPage', () => {
  const mockTour = {
    id: 'tour-1',
    title: 'Summer Tour 2024',
    tourDates: [{ id: 'td-1', venue: { name: 'The Forum' } }],
  };

  const defaultParams = Promise.resolve({ tourId: 'tour-1' });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tour: mockTour }),
    });
  });

  it('should fetch tour from API with tourId', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/tours/tour-1', {
      cache: 'no-store',
    });
  });

  it('should render TourDetailContent with tourId', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    const content = screen.getByTestId('tour-detail-content');
    expect(content).toHaveAttribute('data-tour-id', 'tour-1');
  });

  it('should set query data on success', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    expect(mockSetQueryData).toHaveBeenCalledWith(['tours', 'detail', 'tour-1'], mockTour);
  });

  it('should call notFound when API returns 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(TourPage({ params: defaultParams })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should not set query data when API returns non-OK non-404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const Page = await TourPage({ params: defaultParams });
    render(Page);

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('should encode tourId in URL', async () => {
    const specialParams = Promise.resolve({ tourId: 'tour/special' });

    const Page = await TourPage({ params: specialParams });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/tours/tour%2Fspecial', {
      cache: 'no-store',
    });
  });
});
