/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import TourPage from './page';

// Mock notFound — must throw to stop execution like the real notFound
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock getInternalApiUrl
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => Promise.resolve(`http://test-host${path}`)),
}));

// Mock child component
vi.mock('../components/tour-detail', () => ({
  TourDetail: ({ tour }: { tour: { id: string; name: string } }) => (
    <div data-testid="tour-detail" data-tour-id={tour.id}>
      {tour.name}
    </div>
  ),
}));

describe('TourPage', () => {
  const mockTour = {
    id: 'tour-1',
    name: 'Summer Tour 2024',
    tourDates: [{ id: 'td-1', venue: { name: 'The Forum' } }],
  };

  const defaultParams = Promise.resolve({ tourId: 'tour-1' });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tour: mockTour }),
    }) as unknown as typeof fetch;
  });

  it('should fetch tour by id via internal API', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith('http://test-host/api/tours/tour-1', {
      cache: 'no-store',
    });
  });

  it('should render TourDetail with fetched tour', async () => {
    const Page = await TourPage({ params: defaultParams });
    render(Page);

    const detail = screen.getByTestId('tour-detail');
    expect(detail).toHaveAttribute('data-tour-id', 'tour-1');
    expect(detail).toHaveTextContent('Summer Tour 2024');
  });

  it('should call notFound when fetch returns not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await expect(TourPage({ params: defaultParams })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should call notFound when tour is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tour: null }),
    }) as unknown as typeof fetch;

    await expect(TourPage({ params: defaultParams })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should pass tourId in the URL', async () => {
    const specialParams = Promise.resolve({ tourId: 'some-tour-id' });

    const Page = await TourPage({ params: specialParams });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith('http://test-host/api/tours/some-tour-id', {
      cache: 'no-store',
    });
  });
});
