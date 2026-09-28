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
  CreditConfirmationService: { forArtists: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const ID_A = '507f1f77bcf86cd799439011';
const ID_B = '507f1f77bcf86cd799439012';
const context = { params: Promise.resolve({}) };
const requestFor = (query: string): NextRequest =>
  new NextRequest(`http://localhost/api/artists/credits${query}`);
const confirmation = { awaiting: [], stayHidden: [] };

describe('GET /api/artists/credits', () => {
  beforeEach(() => {
    vi.mocked(CreditConfirmationService.forArtists).mockResolvedValue({
      success: true,
      data: confirmation,
    });
  });

  afterEach(() => {
    vi.mocked(CreditConfirmationService.forArtists).mockReset();
  });

  it('returns the credit confirmation for the given artists', async () => {
    const response = await GET(requestFor(`?id=${ID_A}&id=${ID_B}`), context);

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: confirmation,
    });
  });

  it('reads each given artist once', async () => {
    await GET(requestFor(`?id=${ID_A}&id=${ID_B}&id=${ID_A}`), context);

    expect(vi.mocked(CreditConfirmationService.forArtists).mock.calls).toEqual([[[ID_A, ID_B]]]);
  });

  it('answers with empty lists when no artist is given, without reading', async () => {
    const response = await GET(requestFor(''), context);

    expect({
      body: await response.json(),
      calls: vi.mocked(CreditConfirmationService.forArtists).mock.calls,
    }).toEqual({ body: confirmation, calls: [] });
  });

  it('returns 400 when a value is not an artist id', async () => {
    const response = await GET(requestFor(`?id=${ID_A}&id=mc-example`), context);

    expect(response.status).toBe(400);
  });

  it('returns 400 for more artists than a release can credit', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => index.toString(16).padStart(24, '0'));
    const query = `?${ids.map((id) => `id=${id}`).join('&')}`;

    const response = await GET(requestFor(query), context);

    expect(response.status).toBe(400);
  });

  it('is never cached', async () => {
    const response = await GET(requestFor(`?id=${ID_A}`), context);

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('maps a service failure to its status', async () => {
    vi.mocked(CreditConfirmationService.forArtists).mockResolvedValueOnce({
      success: false,
      code: 'UNAVAILABLE',
      error: 'Database unavailable',
    });

    const response = await GET(requestFor(`?id=${ID_A}`), context);

    expect(response.status).toBe(503);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(CreditConfirmationService.forArtists).mockRejectedValueOnce(new Error('boom'));

    const response = await GET(requestFor(`?id=${ID_A}`), context);

    expect(response.status).toBe(500);
  });
});
