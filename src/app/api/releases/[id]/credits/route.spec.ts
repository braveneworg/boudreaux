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
  CreditConfirmationService: { forRelease: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const releaseId = '507f1f77bcf86cd799439011';
const request = new NextRequest(`http://localhost/api/releases/${releaseId}/credits`);
const context = { params: Promise.resolve({ id: releaseId }) };
const confirmation = {
  awaiting: [
    {
      id: '507f1f77bcf86cd799439012',
      slug: 'mc-example',
      name: 'MC Example',
      bioState: 'none',
      bioGeneratedAt: null,
      displayImageCount: 0,
    },
  ],
  stayHidden: [],
};

describe('GET /api/releases/[id]/credits', () => {
  beforeEach(() => {
    vi.mocked(CreditConfirmationService.forRelease).mockResolvedValue({
      success: true,
      data: confirmation as never,
    });
  });

  afterEach(() => {
    vi.mocked(CreditConfirmationService.forRelease).mockReset();
  });

  it("returns the release's credits awaiting confirmation and those that stay hidden", async () => {
    const response = await GET(request, context);

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: confirmation,
    });
  });

  it('reads the credits of the release in the path', async () => {
    await GET(request, context);

    expect(vi.mocked(CreditConfirmationService.forRelease).mock.calls).toEqual([[releaseId]]);
  });

  it('is never cached', async () => {
    const response = await GET(request, context);

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns 400 for a malformed release id without reading', async () => {
    const response = await GET(request, { params: Promise.resolve({ id: 'nope' }) });

    expect({
      status: response.status,
      calls: vi.mocked(CreditConfirmationService.forRelease).mock.calls,
    }).toEqual({ status: 400, calls: [] });
  });

  it('maps a service failure to its status', async () => {
    vi.mocked(CreditConfirmationService.forRelease).mockResolvedValueOnce({
      success: false,
      code: 'UNAVAILABLE',
      error: 'Database unavailable',
    });

    const response = await GET(request, context);

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 503,
      body: { error: 'Database unavailable' },
    });
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(CreditConfirmationService.forRelease).mockRejectedValueOnce(new Error('boom'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
