// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/services/credit-confirmation-service', () => ({
  CreditConfirmationService: { publishedWorkCreditedTo: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const artistId = '507f1f77bcf86cd799439011';
const request = new NextRequest(`http://localhost/api/artists/${artistId}/published-work`);
const context = { params: Promise.resolve({ id: artistId }) };
const work = {
  releases: [{ id: '507f1f77bcf86cd799439012', title: 'Broken Bone Ballads' }],
  tourDates: [
    {
      id: '507f1f77bcf86cd799439013',
      startDate: '2026-11-01T00:00:00.000Z',
      tourId: '507f1f77bcf86cd799439014',
      tourTitle: 'Fall Tour',
    },
  ],
};

describe('GET /api/artists/[id]/published-work', () => {
  beforeEach(() => {
    vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mockResolvedValue({
      success: true,
      data: work as never,
    });
  });

  afterEach(() => {
    vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mockReset();
  });

  it("returns the public work that carries the artist's name", async () => {
    const response = await GET(request, context);

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: work,
    });
  });

  it('reads the work of the artist in the path', async () => {
    await GET(request, context);

    expect(vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mock.calls).toEqual([
      [artistId],
    ]);
  });

  it('is never cached', async () => {
    const response = await GET(request, context);

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns 400 for a malformed artist id without reading', async () => {
    const response = await GET(request, { params: Promise.resolve({ id: 'nope' }) });

    expect({
      status: response.status,
      calls: vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mock.calls,
    }).toEqual({ status: 400, calls: [] });
  });

  it('maps a service failure to its status', async () => {
    vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mockResolvedValueOnce({
      success: false,
      code: 'UNAVAILABLE',
      error: 'Database unavailable',
    });

    const response = await GET(request, context);

    expect(response.status).toBe(503);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(CreditConfirmationService.publishedWorkCreditedTo).mockRejectedValueOnce(
      new Error('boom')
    );

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
