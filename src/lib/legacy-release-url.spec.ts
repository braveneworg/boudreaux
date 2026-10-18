// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';

import { legacyReleaseId, legacyReleaseResponse } from './legacy-release-url';

vi.mock('server-only', () => ({}));

// The shared `next/server` mock has no `rewrite`, and its `redirect` drops
// a numeric status.
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL, status: number) => ({
      status,
      headers: new Headers({ location: url.href }),
    }),
    rewrite: (url: URL, init: ResponseInit) => ({
      status: init.status,
      headers: new Headers({ 'x-middleware-rewrite': url.href }),
    }),
  },
}));

const getPublishedReleaseRedirectTarget = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleaseRedirectTarget: (id: string) => getPublishedReleaseRedirectTarget(id),
  },
}));

const RELEASE_ID = '0123456789abcdef01234567';

const visit = (releaseId: string) =>
  legacyReleaseResponse(
    { nextUrl: new URL(`http://localhost/releases/${releaseId}`) } as NextRequest,
    releaseId
  );

describe('legacyReleaseId', () => {
  it('reads the id from a /releases/<id> path', () => {
    expect(legacyReleaseId(`/releases/${RELEASE_ID}`)).toBe(RELEASE_ID);
    expect(legacyReleaseId('/releases/not-an-id')).toBe('not-an-id');
  });

  it.each(['/releases', '/releases/', `/releases/${RELEASE_ID}/more`, '/artists/e2e-artist'])(
    'is null for a path that is not one release segment (%s)',
    (pathname) => {
      expect(legacyReleaseId(pathname)).toBeNull();
    }
  );
});

describe('legacyReleaseResponse', () => {
  it("permanently redirects to the release deep link on the album artist's releases", async () => {
    getPublishedReleaseRedirectTarget.mockResolvedValueOnce({ artistSlug: 'e2e-artist' });

    const response = await visit(RELEASE_ID);

    expect(getPublishedReleaseRedirectTarget.mock.calls).toEqual([[RELEASE_ID]]);
    expect(response.status).toBe(308);
    // Next serves a same-origin redirect's location relative.
    expect(response.headers.get('location')).toBe(
      `http://localhost/releases?artist=e2e-artist&release=${RELEASE_ID}`
    );
  });

  it("rewrites in place under a 404 so the segment's not-found page renders", async () => {
    getPublishedReleaseRedirectTarget.mockResolvedValueOnce(null);

    const response = await visit(RELEASE_ID);

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      `http://localhost/releases/${RELEASE_ID}`
    );
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['not-an-id', '0123456789abcdef0123456', `${RELEASE_ID}0`])(
    'is a 404 for an id that is not an ObjectId (%s), without a lookup',
    async (releaseId) => {
      const response = await visit(releaseId);

      expect(response.status).toBe(404);
      expect(getPublishedReleaseRedirectTarget).not.toHaveBeenCalled();
    }
  );
});
