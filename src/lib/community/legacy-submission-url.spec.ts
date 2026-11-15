// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { communityPageSegment, legacySubmissionResponse } from './legacy-submission-url';

vi.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ status: 200, headers: new Headers() }),
    redirect: (url: URL, status: number) => ({
      status,
      headers: new Headers({ location: `${url.pathname}${url.search}` }),
    }),
  },
}));

const ID = '0123456789abcdef01234567';

const visit = (segment: string, query = '') =>
  legacySubmissionResponse(
    { nextUrl: new URL(`http://localhost/community/${segment}${query}`) } as NextRequest,
    segment
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

describe('legacySubmissionResponse', () => {
  it('permanently redirects a submission’s old page to its deep link', () => {
    const response = visit(ID);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`/community?submission=${ID}`);
  });

  it('redirects an id in capitals too: it is still an id', () => {
    const response = visit(ID.toUpperCase());

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`/community?submission=${ID.toUpperCase()}`);
  });

  it('carries nothing of the old address’s query', () => {
    expect(visit(ID, '?utm_source=mail').headers.get('location')).toBe(
      `/community?submission=${ID}`
    );
  });

  it.each(['not-an-id', '0123456789abcdef0123456', `${ID}0`])(
    'leaves a segment that is not an id (%s) to the router, which has no such page',
    (segment) => {
      const response = visit(segment);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    }
  );

  describe('the one-segment community pages', () => {
    // A static page added under /community must never be taken for an id.
    const staticPages = readdirSync(path.join(process.cwd(), 'src/app/community'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
      .map(({ name }) => name);

    it('finds the form and the owner’s list on disk', () => {
      expect(staticPages).toEqual(expect.arrayContaining(['mine', 'submit']));
    });

    it.each(staticPages)('goes on to /community/%s', (segment) => {
      const response = visit(segment);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });
});
