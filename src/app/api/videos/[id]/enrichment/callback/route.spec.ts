// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  VIDEO_ENRICHMENT_CALLBACK_LIMIT,
  videoEnrichmentCallbackLimiter,
} from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { videoEnrichmentJob } from '@/lib/services/video-enrichment-service';
import { videoEnrichmentCallbackSchema } from '@/lib/validation/video-enrichment-schema';

import { dynamic } from './route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/decorators/signed-callback-route', () => ({
  signedCallbackRoute: vi.fn(() => vi.fn()),
}));

/** The options this route handed the factory at import, read before any mock is cleared. */
const options = vi.mocked(signedCallbackRoute).mock.calls[0]?.[0];

// The protocol is pinned once, in `signed-callback-route.spec.ts`; this spec
// pins only what this route decides.
describe('POST /api/videos/[id]/enrichment/callback', () => {
  it('is the video enrichment job’s callback channel, under its own limiter', () => {
    expect(options).toMatchObject({
      job: videoEnrichmentJob,
      channel: 'callback',
      schema: videoEnrichmentCallbackSchema,
      limiter: videoEnrichmentCallbackLimiter,
      limit: VIDEO_ENRICHMENT_CALLBACK_LIMIT,
    });
  });

  it('caps the body at 512 KiB', () => {
    expect(options?.maxBodyBytes).toBe(512 * 1024);
  });

  // Revalidating `videos.detail` would reset the admin form mid-edit; the
  // panel polls the enrichment query key instead.
  it('runs no completion hook', () => {
    expect(options).not.toHaveProperty('onComplete');
  });

  it('renders dynamically', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
