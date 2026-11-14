// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';

import { communityPageSegment, submissionPageResponse } from './submission-page-status';

vi.mock('server-only', () => ({}));

// The shared `next/server` mock has no `rewrite`.
vi.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ status: 200, headers: new Headers() }),
    rewrite: (url: URL, init: ResponseInit) => ({
      status: init.status,
      headers: new Headers({ 'x-middleware-rewrite': url.href }),
    }),
  },
}));

const isPublic = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/submission-service', () => ({
  SubmissionService: { isPublic: (id: string) => isPublic(id) },
}));

const ID = '0123456789abcdef01234567';

const visit = (segment: string, hasSession: boolean) =>
  submissionPageResponse(
    { nextUrl: new URL(`http://localhost/community/${segment}`) } as NextRequest,
    segment,
    hasSession
  );

describe('communityPageSegment', () => {
  it('reads the one segment after /community', () => {
    expect(communityPageSegment(`/community/${ID}`)).toBe(ID);
    expect(communityPageSegment('/community/submit')).toBe('submit');
  });

  it.each([
    '/community',
    '/community/',
    `/community/${ID}/edit`,
    '/community-archive/x',
    '/videos',
  ])('is null for a path that is not one community segment (%s)', (pathname) => {
    expect(communityPageSegment(pathname)).toBeNull();
  });
});

describe('submissionPageResponse', () => {
  describe('a signed-out request', () => {
    it('goes on to the page of a public submission', async () => {
      isPublic.mockResolvedValueOnce(true);

      const response = await visit(ID, false);

      expect(isPublic.mock.calls).toEqual([[ID]]);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('is rewritten in place under a 404 when the id is not a public submission', async () => {
      isPublic.mockResolvedValueOnce(false);

      const response = await visit(ID, false);

      expect(response.status).toBe(404);
      expect(response.headers.get('x-middleware-rewrite')).toBe(`http://localhost/community/${ID}`);
    });

    it.each(['not-an-id', '0123456789abcdef0123456', `${ID}0`])(
      'is a 404 for a segment that is not an id (%s), without a lookup',
      async (segment) => {
        const response = await visit(segment, false);

        expect(response.status).toBe(404);
        expect(isPublic).not.toHaveBeenCalled();
      }
    );

    it.each(['submit', 'mine'])(
      'leaves /community/%s to its page, which sends the visitor to sign in',
      async (segment) => {
        const response = await visit(segment, false);

        expect(response.status).toBe(200);
        expect(isPublic).not.toHaveBeenCalled();
      }
    );

    it('goes on to the page when the lookup fails, so the proxy never takes the page down', async () => {
      isPublic.mockRejectedValueOnce(new Error('mongo: boom'));

      const response = await visit(ID, false);

      expect(response.status).toBe(200);
    });
  });

  describe('a request with a session cookie', () => {
    it('always goes on to the page, which decides for that reader', async () => {
      const response = await visit(ID, true);

      expect(response.status).toBe(200);
    });

    it('is never looked up: its answer must not say whether an id exists', async () => {
      await visit(ID, true);
      await visit('not-an-id', true);

      expect(isPublic).not.toHaveBeenCalled();
    });
  });
});
