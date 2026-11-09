// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { VenueService } from '@/lib/services/tours/venue-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    () =>
    (handler: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      handler(...args),
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({ publicLimiter: {}, PUBLIC_LIMIT: 100 }));

vi.mock('@/lib/services/tours/venue-service', () => ({
  VenueService: { findForPicker: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const venue = {
  id: '507f1f77bcf86cd799439011',
  name: 'The Fillmore',
  address: '1805 Geary Blvd',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94115',
  country: 'USA',
  capacity: 1150,
  notes: 'Load-in at the back',
  timeZone: 'America/Los_Angeles',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: null,
  updatedBy: null,
};

const get = (query = ''): Promise<Response> =>
  GET(new NextRequest(`http://localhost:3000/api/venues${query}`), {
    params: Promise.resolve({}),
  }) as Promise<Response>;

describe('GET /api/venues', () => {
  it("answers the picker's venues, each with only the fields the picker shows", async () => {
    vi.mocked(VenueService.findForPicker).mockResolvedValueOnce([venue]);

    const response = await get();

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: {
        venues: [
          {
            id: venue.id,
            name: 'The Fillmore',
            city: 'San Francisco',
            state: 'CA',
            timeZone: 'America/Los_Angeles',
          },
        ],
      },
    });
  });

  it('asks the venue service with no search when nothing is typed', async () => {
    vi.mocked(VenueService.findForPicker).mockResolvedValueOnce([]);

    await get();

    expect(vi.mocked(VenueService.findForPicker).mock.calls).toEqual([[undefined]]);
  });

  it('passes the search term to the venue service', async () => {
    vi.mocked(VenueService.findForPicker).mockResolvedValueOnce([]);

    await get('?search=fill');

    expect(vi.mocked(VenueService.findForPicker).mock.calls).toEqual([['fill']]);
  });

  it('reads a venue without a city, state or time zone as null', async () => {
    vi.mocked(VenueService.findForPicker).mockResolvedValueOnce([
      { ...venue, city: undefined, state: undefined, timeZone: undefined } as never,
    ]);

    const response = await get();
    const { venues } = (await response.json()) as { venues: Array<Record<string, unknown>> };

    expect(venues[0]).toEqual({
      id: venue.id,
      name: 'The Fillmore',
      city: null,
      state: null,
      timeZone: null,
    });
  });

  it('answers a failed read with 500 and fixed copy', async () => {
    vi.mocked(VenueService.findForPicker).mockRejectedValueOnce(new Error('db down'));

    const response = await get();

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 500,
      body: { error: 'Failed to fetch venues' },
    });
  });
});
