/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

const mockFindBySessionId = vi.fn();

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findBySessionId: (...args: unknown[]) => mockFindBySessionId(...args),
  },
}));

const makeRequest = (sessionId?: string) => {
  const url = `http://localhost/api/releases/release-123/purchase-status${sessionId ? `?sessionId=${sessionId}` : ''}`;
  return new NextRequest(url);
};

describe('GET /api/releases/[id]/purchase-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with missing_session_id when sessionId is absent', async () => {
    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'missing_session_id' });
  });

  it('returns 200 with confirmed: false and no-store header when purchase is not found', async () => {
    mockFindBySessionId.mockResolvedValue(null);

    const request = makeRequest('cs_test_notfound');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindBySessionId).toHaveBeenCalledWith('cs_test_notfound');
  });

  it('returns 200 with confirmed: true when a purchase record exists', async () => {
    mockFindBySessionId.mockResolvedValue({
      id: 'purchase-abc',
      stripeSessionId: 'cs_test_found',
    });

    const request = makeRequest('cs_test_found');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: true });
    expect(mockFindBySessionId).toHaveBeenCalledWith('cs_test_found');
  });
});
