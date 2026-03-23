/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

const mockFindByPaymentIntentId = vi.fn();

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByPaymentIntentId: (...args: unknown[]) => mockFindByPaymentIntentId(...args),
  },
}));

const makeRequest = (paymentIntentId?: string) => {
  const url = `http://localhost/api/releases/release-123/purchase-status${paymentIntentId ? `?paymentIntentId=${paymentIntentId}` : ''}`;
  return new NextRequest(url);
};

describe('GET /api/releases/[id]/purchase-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 with missing_payment_intent_id when paymentIntentId is absent', async () => {
    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: 'missing_payment_intent_id' });
  });

  it('returns 200 with confirmed: false and no-store header when purchase is not found', async () => {
    mockFindByPaymentIntentId.mockResolvedValue(null);

    const request = makeRequest('pi_test_notfound');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindByPaymentIntentId).toHaveBeenCalledWith('pi_test_notfound');
  });

  it('returns 200 with confirmed: true when a purchase record exists', async () => {
    mockFindByPaymentIntentId.mockResolvedValue({
      id: 'purchase-abc',
      stripePaymentIntentId: 'pi_test_found',
    });

    const request = makeRequest('pi_test_found');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ confirmed: true });
    expect(mockFindByPaymentIntentId).toHaveBeenCalledWith('pi_test_found');
  });
});
