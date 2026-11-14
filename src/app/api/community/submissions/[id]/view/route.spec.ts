// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { submissionViewLimiter } from '@/lib/config/rate-limit-tiers';
import { SubmissionViewEventService } from '@/lib/services/submission-view-event-service';
import { loggers } from '@/lib/utils/logger';
import { resolveGuestSubject } from '@/lib/utils/resolve-download-subject';

import { POST } from './route';

vi.mock('server-only', () => ({}));

// The real `withRateLimit` runs; only the limiter behind it is stubbed.
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  submissionViewLimiter: { check: vi.fn() },
  SUBMISSION_VIEW_LIMIT: 10,
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/services/submission-view-event-service', () => ({
  SubmissionViewEventService: { record: vi.fn() },
}));
vi.mock('@/lib/utils/resolve-download-subject', () => ({ resolveGuestSubject: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    http: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  },
}));
vi.mock('@/lib/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));

const SUBMISSION_ID = 'c'.repeat(24);
const USER_ID = 'b'.repeat(24);
const ADDRESS = '203.0.113.7';
const NOW = new Date('2026-11-14T12:00:00.000Z');

const session = vi.mocked(auth);
const record = vi.mocked(SubmissionViewEventService.record);
const check = vi.mocked(submissionViewLimiter.check);

const SAME_ORIGIN = { 'sec-fetch-site': 'same-origin', 'x-real-ip': ADDRESS };

const post = (
  id: string = SUBMISSION_ID,
  headers: Record<string, string> = SAME_ORIGIN
): { request: NextRequest; response: Promise<Response> } => {
  const request = new NextRequest(`http://localhost:3000/api/community/submissions/${id}/view`, {
    method: 'POST',
    headers,
  });

  return {
    request,
    response: Promise.resolve(POST(request, { params: Promise.resolve({ id }) })),
  };
};

const signedInAs = (user: Record<string, unknown>): void => {
  session.mockResolvedValueOnce({ user: { id: USER_ID, ...user } } as never);
};

// A queued answer a case never reached must not answer the next one.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('E2E_MODE', '');
  session.mockReset();
  record.mockReset();
  check.mockReset();
  vi.mocked(resolveGuestSubject).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/community/submissions/[id]/view', () => {
  describe('a signed-out visitor', () => {
    it('asks for the view to be counted as a guest’s, from their address, now', async () => {
      session.mockResolvedValueOnce(null as never);
      record.mockResolvedValueOnce(true);

      await post().response;

      expect(record.mock.calls).toEqual([
        [
          {
            submissionId: SUBMISSION_ID,
            viewer: null,
            resolveGuest: expect.any(Function),
            address: ADDRESS,
            now: NOW,
          },
        ],
      ]);
    });

    it('is identified as a download’s guest is, from this request, only when asked', async () => {
      session.mockResolvedValueOnce(null as never);
      record.mockResolvedValueOnce(true);
      vi.mocked(resolveGuestSubject).mockResolvedValueOnce({
        kind: 'guest',
        visitorId: 'visitor-1',
        visitorIds: ['visitor-1'],
      });

      const { request, response } = post();
      await response;

      expect(vi.mocked(resolveGuestSubject).mock.calls).toEqual([]);
      await expect(record.mock.calls[0]?.[0].resolveGuest()).resolves.toBe('visitor-1');
      expect(vi.mocked(resolveGuestSubject).mock.calls).toEqual([[request]]);
    });
  });

  describe('a signed-in viewer', () => {
    it('asks for the view to be counted as the account’s, with its role', async () => {
      signedInAs({ role: 'manager' });
      record.mockResolvedValueOnce(false);

      await post().response;

      expect(record.mock.calls[0]?.[0].viewer).toEqual({ id: USER_ID, role: 'manager' });
    });

    it('has no role when the session names none', async () => {
      signedInAs({});
      record.mockResolvedValueOnce(true);

      await post().response;

      expect(record.mock.calls[0]?.[0].viewer).toEqual({ id: USER_ID, role: null });
    });

    it('who is banned is answered as anyone is, and nothing is counted', async () => {
      signedInAs({ role: 'user', banned: true });

      const { response } = post();

      expect((await response).status).toBe(204);
      expect(record.mock.calls).toEqual([]);
    });
  });

  describe('the answer', () => {
    it.each([true, false])(
      'is an empty 204 that is never cached, whether or not a view was counted (%s)',
      async (counted) => {
        session.mockResolvedValueOnce(null as never);
        record.mockResolvedValueOnce(counted);

        const response = await post().response;

        expect(response.status).toBe(204);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        await expect(response.text()).resolves.toBe('');
      }
    );

    it('is a 400 for an id that cannot name a submission, and nothing is read', async () => {
      const response = await post('not-an-id').response;

      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(session.mock.calls).toEqual([]);
      expect(record.mock.calls).toEqual([]);
    });

    it('is a 500 that is never cached when counting fails, and the failure is logged', async () => {
      const failure = new Error('database is down');
      session.mockResolvedValueOnce(null as never);
      record.mockRejectedValueOnce(failure);

      const response = await post().response;

      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(vi.mocked(loggers.media.error).mock.calls).toEqual([
        ['Submission view count error', failure],
      ]);
    });
  });

  describe('a request that did not come from a page of this site', () => {
    it.each([
      ['another site', { 'sec-fetch-site': 'cross-site', 'x-real-ip': ADDRESS }],
      ['nowhere it names', { 'x-real-ip': ADDRESS }],
    ])('from %s is answered as a counted one and counts nothing', async (_name, headers) => {
      const response = await post(SUBMISSION_ID, headers).response;

      expect(response.status).toBe(204);
      expect(session.mock.calls).toEqual([]);
      expect(record.mock.calls).toEqual([]);
    });
  });

  describe('the rate limit', () => {
    it('counts each request against the caller’s address, ten a minute', async () => {
      session.mockResolvedValueOnce(null as never);
      record.mockResolvedValueOnce(true);

      await post().response;

      expect(check.mock.calls).toEqual([[10, ADDRESS]]);
    });

    it('answers 429 past the limit, and nothing is counted', async () => {
      check.mockRejectedValueOnce(new Error('rate limited'));

      const response = await post().response;

      expect(response.status).toBe(429);
      expect(record.mock.calls).toEqual([]);
    });
  });
});
