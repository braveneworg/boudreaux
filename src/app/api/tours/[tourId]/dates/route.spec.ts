// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// Model withAdmin: pass through for an admin, 401 otherwise.
const authState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/lib/decorators/with-auth', async () => {
  const { NextResponse: Response } = await import('next/server');
  return {
    withAdmin:
      (handler: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        authState.isAdmin
          ? handler(...args)
          : Response.json({ error: 'Authentication required' }, { status: 401 }),
  };
});

vi.mock('@/lib/repositories/tours/tour-date-repository', () => ({
  TourDateRepository: { findByTourId: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const tourId = '507f1f77bcf86cd799439011';
const tourDates = [{ id: '507f1f77bcf86cd799439012', tourId }];

const get = (id = tourId): Promise<Response> =>
  GET(new NextRequest(`http://localhost:3000/api/tours/${id}/dates`), {
    params: Promise.resolve({ tourId: id }),
  }) as Promise<Response>;

describe('GET /api/tours/[tourId]/dates', () => {
  beforeEach(() => {
    vi.mocked(TourDateRepository.findByTourId).mockResolvedValue(tourDates as never);
  });

  afterEach(() => {
    authState.isAdmin = true;
    vi.mocked(TourDateRepository.findByTourId).mockReset();
  });

  it("returns every date of the tour to an admin, for the tour's edit screen", async () => {
    const response = await get();

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: { tourDates },
    });
  });

  it('refuses a visitor who is not an admin, without reading (ADR-0015)', async () => {
    authState.isAdmin = false;

    const response = await get();

    expect({
      status: response.status,
      reads: vi.mocked(TourDateRepository.findByTourId).mock.calls,
    }).toEqual({ status: 401, reads: [] });
  });

  it('is never shared-cached: it names every headliner whatever its state', async () => {
    const response = await get();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns no dates for a malformed tour id, without reading', async () => {
    const response = await get('nope');

    expect({
      body: await response.json(),
      reads: vi.mocked(TourDateRepository.findByTourId).mock.calls,
    }).toEqual({ body: { tourDates: [] }, reads: [] });
  });

  it('returns 500 when the read fails', async () => {
    vi.mocked(TourDateRepository.findByTourId).mockRejectedValueOnce(new Error('down'));

    const response = await get();

    expect(response.status).toBe(500);
  });
});
