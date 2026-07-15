// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ProducerRepository } from '@/lib/repositories/producer-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit: () => (handler: unknown) => handler,
}));

vi.mock('@/lib/repositories/producer-repository', () => ({
  ProducerRepository: { findByVideoId: vi.fn() },
}));

const VIDEO_ID = 'f'.repeat(24);
const INVALID_ID = 'not-an-objectid';
const request = new NextRequest(`http://localhost/api/videos/${VIDEO_ID}/producers`);
const context = { params: Promise.resolve({ id: VIDEO_ID }) };

const producers = [
  { id: 'p1', name: 'Rick Rubin' },
  { id: 'p2', name: 'Brian Eno' },
];

describe('GET /api/videos/[id]/producers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with producers for a valid ObjectId', async () => {
    vi.mocked(ProducerRepository.findByVideoId).mockResolvedValue(producers);

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ producers });
    expect(ProducerRepository.findByVideoId).toHaveBeenCalledWith(VIDEO_ID);
  });

  it('returns 400 for an invalid ObjectId', async () => {
    const badRequest = new NextRequest(`http://localhost/api/videos/${INVALID_ID}/producers`);
    const badContext = { params: Promise.resolve({ id: INVALID_ID }) };

    const response = await GET(badRequest, badContext);

    expect(response.status).toBe(400);
    expect(ProducerRepository.findByVideoId).not.toHaveBeenCalled();
  });

  it('returns 500 when the repository throws', async () => {
    vi.mocked(ProducerRepository.findByVideoId).mockRejectedValue(new Error('db error'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
