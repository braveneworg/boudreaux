// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GET } from './route';

vi.mock('server-only', () => ({}));

// Like Next's own, both mocks throw: nothing after them runs.
const { notFound, permanentRedirect } = vi.hoisted(() => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    permanentRedirect(url);
    throw new Error('NEXT_REDIRECT');
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
  GET(new Request(`http://localhost/releases/${releaseId}`), {
    params: Promise.resolve({ releaseId }),
  });

describe('GET /releases/[releaseId]', () => {
  it("permanently redirects to the release deep link on the album artist's releases", async () => {
    getPublishedReleaseRedirectTarget.mockResolvedValueOnce({ artistSlug: 'e2e-artist' });

    await expect(visit(RELEASE_ID)).rejects.toThrow('NEXT_REDIRECT');

    expect(getPublishedReleaseRedirectTarget.mock.calls).toEqual([[RELEASE_ID]]);
    expect(permanentRedirect.mock.calls).toEqual([
      [`/releases?artist=e2e-artist&release=${RELEASE_ID}`],
    ]);
  });

  it('is a 404 when no listed release with a public album artist has the id', async () => {
    getPublishedReleaseRedirectTarget.mockResolvedValueOnce(null);

    await expect(visit(RELEASE_ID)).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it.each(['not-an-id', '0123456789abcdef0123456', `${RELEASE_ID}0`])(
    'is a 404 for an id that is not an ObjectId (%s), without a lookup',
    async (releaseId) => {
      await expect(visit(releaseId)).rejects.toThrow('NEXT_NOT_FOUND');

      expect(getPublishedReleaseRedirectTarget).not.toHaveBeenCalled();
      expect(permanentRedirect).not.toHaveBeenCalled();
    }
  );
});
