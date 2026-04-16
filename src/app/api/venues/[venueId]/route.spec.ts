// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { VenueRepository } from '@/lib/repositories/tours/venue-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/tours/venue-repository', () => ({
  VenueRepository: {
    findById: vi.fn(),
  },
}));

describe('GET /api/venues/[venueId]', () => {
  const mockVenue = {
    id: '507f1f77bcf86cd799439011',
    name: 'The Fillmore',
    address: '1805 Geary Blvd',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94115',
    country: 'USA',
    capacity: 1150,
    notes: null,
    timeZone: 'America/Los_Angeles',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createParams = (venueId: string) => ({
    params: Promise.resolve({ venueId }),
  });
  it('should return a venue by ID', async () => {
    vi.mocked(VenueRepository.findById).mockResolvedValue(mockVenue as never);

    const request = new NextRequest('http://localhost:3000/api/venues/507f1f77bcf86cd799439011');
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.venue.id).toBe('507f1f77bcf86cd799439011');
    expect(data.venue.name).toBe('The Fillmore');
    expect(VenueRepository.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('should return 404 when venue not found', async () => {
    vi.mocked(VenueRepository.findById).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/venues/507f1f77bcf86cd799439012');
    const response = await GET(request, createParams('507f1f77bcf86cd799439012'));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Venue not found');
  });

  it('should return 500 when repository throws', async () => {
    vi.mocked(VenueRepository.findById).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/venues/507f1f77bcf86cd799439011');
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch venue');
  });
});
