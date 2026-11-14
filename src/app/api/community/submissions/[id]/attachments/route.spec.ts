// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { SubmissionService } from '@/lib/services/submission-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));
/** The role of the session the stand-in `withAuth` hands the handler. */
const signedIn = vi.hoisted(() => ({ role: 'admin' }));

// The decorator's own rules are pinned in `with-auth.spec.ts`; here it only
// hands the handler a session.
vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth:
    (handler: (request: unknown, context: unknown, session: unknown) => unknown) =>
    (request: unknown, context: unknown) =>
      handler(request, context, { user: { id: 'a'.repeat(24), role: signedIn.role } }),
}));
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: { getForViewer: vi.fn() },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));

const USER_ID = 'a'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const UPDATED = new Date('2026-11-11T12:00:00.000Z');

const request = new NextRequest(
  `http://localhost/api/community/submissions/${SUBMISSION_ID}/attachments`
);

/** GET the list as a signed-in user with `role`. */
const getAs = (role: string, id = SUBMISSION_ID): Promise<Response> => {
  signedIn.role = role;

  return GET(request, { params: Promise.resolve({ id }) });
};

const attachments = [{ id: 'e'.repeat(24), kind: 'IMAGE', state: 'processing' }];

const view = (viewer: 'owner' | 'approver' | 'public') =>
  ({ status: 'DRAFT', updatedAt: UPDATED, viewer, attachments }) as never;

beforeEach(() => {
  vi.mocked(SubmissionService.getForViewer).mockReset();
});

describe('GET /api/community/submissions/[id]/attachments', () => {
  it('answers the attachments and where the submission stands', async () => {
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view('owner'));

    const response = await getAs('admin');

    await expect(response.json()).resolves.toEqual({
      status: 'DRAFT',
      updatedAt: UPDATED.toISOString(),
      attachments,
    });
  });

  it('reads as the session’s user', async () => {
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view('owner'));

    await getAs('manager');

    expect(vi.mocked(SubmissionService.getForViewer).mock.calls).toEqual([
      [SUBMISSION_ID, { id: USER_ID, role: 'manager' }],
    ]);
  });

  it('is never cached', async () => {
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view('approver'));

    const response = await getAs('admin');

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is not found for a submission the reader may not open', async () => {
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(null);

    const response = await getAs('admin');

    expect(response.status).toBe(404);
  });

  it('is not found for a reader who is only the public, even on an approved submission', async () => {
    vi.mocked(SubmissionService.getForViewer).mockResolvedValueOnce(view('public'));

    const response = await getAs('admin');

    expect(response.status).toBe(404);
  });

  it('is not found, and reads nothing, for anyone but an approver before launch', async () => {
    const response = await getAs('user');

    expect(response.status).toBe(404);
    expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
  });

  it('is not found, and reads nothing, for an id that is not an id', async () => {
    const response = await getAs('admin', 'mine');

    expect(response.status).toBe(404);
    expect(SubmissionService.getForViewer).not.toHaveBeenCalled();
  });

  it('answers 500 without the cause when the read fails', async () => {
    vi.mocked(SubmissionService.getForViewer).mockRejectedValueOnce(new Error('mongo down'));

    const response = await getAs('admin');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });
});
