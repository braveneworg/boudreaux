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

const mockFindById = vi.fn();
vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

// Mock child component
vi.mock('../components/tour-detail-content', () => ({
  TourDetailContent: ({ tourId }: { tourId: string }) => (
    <div data-testid="tour-detail-content" data-tour-id={tourId}>
      Tour Detail Content
    </div>
  ),
}));

// Mock page shell components
vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
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
    mockFindById.mockResolvedValue(mockTour);
  });

  it('should call TourRepository.findById with tourId', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    expect(mockFindById).toHaveBeenCalledWith('tour-1');
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

  it('should call notFound when repository returns null', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(TourPage({ params: defaultParams })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should not set query data when repository returns null', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(TourPage({ params: defaultParams })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('should pass the tourId to the repository unchanged', async () => {
    const specialParams = Promise.resolve({ tourId: 'tour/special' });

    const Page = await TourPage({ params: specialParams });
    render(Page);

    expect(mockFindById).toHaveBeenCalledWith('tour/special');
  });

  it('should render the standard page shell instead of the legacy container div', async () => {
    const Page = await TourPage({ params: defaultParams });
    const { container } = render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    const contentContainer = screen.getByTestId('content-container');
    expect(contentContainer).toContainElement(screen.getByTestId('tour-detail-content'));
    expect(container.querySelector('.container')).toBeNull();
  });
});
