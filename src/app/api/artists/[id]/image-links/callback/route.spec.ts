// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidateArtistBioPaths } from '@/lib/actions/generate-artist-bio-action-helpers';
import { BIO_CALLBACK_LIMIT, bioCallbackLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { imageLinksJob } from '@/lib/services/image-links-service';
import { imageLinksCallbackSchema } from '@/lib/validation/image-links-schema';

import { dynamic } from './route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/decorators/signed-callback-route', () => ({
  signedCallbackRoute: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/actions/generate-artist-bio-action-helpers', () => ({
  revalidateArtistBioPaths: vi.fn(),
}));

/** The options this route handed the factory at import, read before any mock is cleared. */
const options = vi.mocked(signedCallbackRoute).mock.calls[0]?.[0];
const onComplete = options?.channel === 'callback' ? options.onComplete : undefined;

// The protocol is pinned once, in `signed-callback-route.spec.ts`; this spec
// pins only what this route decides.
describe('POST /api/artists/[id]/image-links/callback', () => {
  it('is the images-from-links job’s callback channel, sharing the bio callback limiter', () => {
    expect(options).toMatchObject({
      job: imageLinksJob,
      channel: 'callback',
      schema: imageLinksCallbackSchema,
      limiter: bioCallbackLimiter,
      limit: BIO_CALLBACK_LIMIT,
    });
  });

  it('caps the body at 512 KiB', () => {
    expect(options?.maxBodyBytes).toBe(512 * 1024);
  });

  it("revalidates the artist's pages once the completion has run", () => {
    onComplete?.({ slug: 'ceschi' });

    expect(vi.mocked(revalidateArtistBioPaths).mock.calls).toEqual([['ceschi']]);
  });

  it('renders dynamically', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
