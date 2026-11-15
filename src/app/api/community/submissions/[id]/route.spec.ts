// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { publicLimiter } from '@/lib/config/rate-limit-tiers';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionView } from '@/lib/types/domain/submission';
import { loggers } from '@/lib/utils/logger';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// The real `withRateLimit` runs; only the limiter behind it is stubbed.
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: { check: vi.fn() },
  PUBLIC_LIMIT: 60,
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: { getForViewer: vi.fn() },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    http: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  },
}));
vi.mock('@/lib/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));

const SUBMISSION_ID = 'c'.repeat(24);
const USER_ID = 'b'.repeat(24);

const session = vi.mocked(auth);
const getForViewer = vi.mocked(SubmissionService.getForViewer);
const check = vi.mocked(publicLimiter.check);

const view: SubmissionView = {
  id: SUBMISSION_ID,
  ownerId: 'a'.repeat(24),
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>Poem</p>',
  links: [],
  listed: true,
  status: 'APPROVED',
  rejectionReason: null,
  publishedAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  owner: { username: 'ada', gravatarHash: 'f'.repeat(64) },
  viewer: 'public',
  isPublic: true,
  queuePosition: null,
  attachments: [],
};

const get = (id: string = SUBMISSION_ID): Promise<Response> =>
  Promise.resolve(
    GET(new NextRequest(`http://localhost:3000/api/community/submissions/${id}`), {
      params: Promise.resolve({ id }),
    })
  );

// A queued answer a case never reached must not answer the next one.
beforeEach(() => {
  vi.stubEnv('E2E_MODE', '');
  session.mockReset();
  getForViewer.mockReset();
  check.mockReset();
});

describe('GET /api/community/submissions/[id]', () => {
  it('answers a signed-out reader the submission they may open', async () => {
    session.mockResolvedValueOnce(null);
    getForViewer.mockResolvedValueOnce(view);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: SUBMISSION_ID,
      title: 'Bus poem',
      viewer: 'public',
    });
    expect(getForViewer.mock.calls).toEqual([[SUBMISSION_ID, null]]);
  });

  it('sends nothing of the owner’s id or the dates', async () => {
    session.mockResolvedValueOnce(null);
    getForViewer.mockResolvedValueOnce(view);

    const body: unknown = await (await get()).json();

    expect(Object.keys(body as object)).not.toEqual(
      expect.arrayContaining(['ownerId', 'publishedAt', 'updatedAt'])
    );
  });

  it('asks as the signed-in reader, so an owner opens their own draft', async () => {
    session.mockResolvedValueOnce({ user: { id: USER_ID, role: 'user' } } as never);
    getForViewer.mockResolvedValueOnce({ ...view, viewer: 'owner', status: 'DRAFT' });

    const response = await get();

    expect(response.status).toBe(200);
    expect(getForViewer.mock.calls).toEqual([[SUBMISSION_ID, { id: USER_ID, role: 'user' }]]);
  });

  it('is never cached', async () => {
    session.mockResolvedValueOnce(null);
    getForViewer.mockResolvedValueOnce(view);

    const response = await get();

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('answers not found for a submission the reader may not open', async () => {
    session.mockResolvedValueOnce(null);
    getForViewer.mockResolvedValueOnce(null);

    const response = await get();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('answers an id that cannot be one the same way, and reads nothing', async () => {
    const response = await get('not-an-id');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(getForViewer).not.toHaveBeenCalled();
  });

  it('answers a banned account the same way, and reads nothing', async () => {
    session.mockResolvedValueOnce({ user: { id: USER_ID, role: 'user', banned: true } } as never);

    const response = await get();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(getForViewer).not.toHaveBeenCalled();
  });

  it('answers a failed read with a server error, and logs it', async () => {
    const failure = new Error('database down');
    session.mockResolvedValueOnce(null);
    getForViewer.mockRejectedValueOnce(failure);

    const response = await get();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    expect(loggers.media.error).toHaveBeenCalledWith('Submission read error', failure);
  });

  it('refuses a caller over the rate limit before reading anything', async () => {
    check.mockRejectedValueOnce(new Error('Rate limit exceeded'));

    const response = await get();

    expect(response.status).toBe(429);
    expect(getForViewer).not.toHaveBeenCalled();
  });
});
