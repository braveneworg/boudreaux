// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { publicLimiter } from '@/lib/config/rate-limit-tiers';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// The real `withRateLimit` runs; only the limiter behind it is stubbed.
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: { check: vi.fn().mockResolvedValue(undefined) },
  PUBLIC_LIMIT: 30,
}));

vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: { listCards: vi.fn(), ownerNamed: vi.fn() },
}));

const OWNER_ID = 'a'.repeat(24);

const card = (id: string): SubmissionCard => ({
  id,
  title: 'Bus poem',
  category: 'WRITING',
  cardPictureUrl: null,
  owner: { username: 'ada', gravatarHash: 'abc123' },
});

const emptyContext = { params: Promise.resolve({}) };

const call = (query = ''): ReturnType<typeof GET> =>
  GET(new NextRequest(`http://localhost:3000/api/community/submissions${query}`), emptyContext);

describe('GET /api/community/submissions', () => {
  it('answers the first page of listed submissions to anyone, with no session', async () => {
    const rows = [card('1'.repeat(24)), card('2'.repeat(24))];
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce(rows);

    const response = await call();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ rows, nextSkip: null });
    expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([[{ skip: 0, take: 12 }]]);
  });

  it('is never cached, so a rejected submission leaves on the next read', async () => {
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce([]);

    const response = await call();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('names the next page when this one is full', async () => {
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce([
      card('1'.repeat(24)),
      card('2'.repeat(24)),
    ]);

    const response = await call('?skip=4&take=2');

    await expect(response.json()).resolves.toMatchObject({ nextSkip: 6 });
    expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([[{ skip: 4, take: 2 }]]);
  });

  it('passes a search term on, trimmed', async () => {
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce([]);

    await call('?search=%20bus%20&take=8');

    expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([
      [{ skip: 0, take: 8, search: 'bus' }],
    ]);
  });

  it('narrows to the account a username names', async () => {
    vi.mocked(SubmissionService.ownerNamed).mockResolvedValueOnce({
      id: OWNER_ID,
      username: 'ada',
    });
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce([]);

    await call('?user=ada');

    expect(vi.mocked(SubmissionService.ownerNamed).mock.calls).toEqual([['ada']]);
    expect(vi.mocked(SubmissionService.listCards).mock.calls).toEqual([
      [{ skip: 0, take: 12, ownerId: OWNER_ID }],
    ]);
  });

  it('answers an empty page for a username that names no account', async () => {
    vi.mocked(SubmissionService.ownerNamed).mockResolvedValueOnce(null);

    const response = await call('?user=nobody');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ rows: [], nextSkip: null });
    expect(SubmissionService.listCards).not.toHaveBeenCalled();
  });

  it.each([
    ['a page over the largest', '?take=25'],
    ['a negative offset', '?skip=-1'],
    ['a search term past the limit', `?search=${'a'.repeat(101)}`],
  ])('refuses %s with a 400 and reads nothing', async (_name, query) => {
    const response = await call(query);

    expect(response.status).toBe(400);
    expect(SubmissionService.listCards).not.toHaveBeenCalled();
  });

  it('answers a 500 without the cause when the read fails', async () => {
    vi.mocked(SubmissionService.listCards).mockRejectedValueOnce(new Error('mongo: boom'));

    const response = await call();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });

  it('spends the caller’s public rate limit', async () => {
    vi.mocked(SubmissionService.listCards).mockResolvedValueOnce([]);

    await call();

    expect(vi.mocked(publicLimiter.check).mock.calls).toHaveLength(1);
  });

  it('answers a 429, reading nothing, once the limit is spent', async () => {
    vi.mocked(publicLimiter.check).mockRejectedValueOnce(new Error('limit'));

    const response = await call();

    expect(response.status).toBe(429);
    expect(SubmissionService.listCards).not.toHaveBeenCalled();
  });
});
