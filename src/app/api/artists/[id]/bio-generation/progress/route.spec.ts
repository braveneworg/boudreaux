// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BIO_PROGRESS_LIMIT, bioProgressLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { bioGenerationJob } from '@/lib/services/bio-generation-service';
import { bioProgressPostSchema } from '@/lib/validation/bio-generation-schema';

import { dynamic } from './route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/decorators/signed-callback-route', () => ({
  signedCallbackRoute: vi.fn(() => vi.fn()),
}));

/** The options this route handed the factory at import, read before any mock is cleared. */
const options = vi.mocked(signedCallbackRoute).mock.calls[0]?.[0];

// The protocol is pinned once, in `signed-callback-route.spec.ts`; this spec
// pins only what this route decides.
describe('POST /api/artists/[id]/bio-generation/progress', () => {
  it('is the bio generation job’s progress channel, under the bio progress limiter', () => {
    expect(options).toMatchObject({
      job: bioGenerationJob,
      channel: 'progress',
      schema: bioProgressPostSchema,
      limiter: bioProgressLimiter,
      limit: BIO_PROGRESS_LIMIT,
    });
  });

  it('caps the body at 4 KiB', () => {
    expect(options?.maxBodyBytes).toBe(4 * 1024);
  });

  it('renders dynamically', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
