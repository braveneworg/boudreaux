// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { REENCODE_PROGRESS_LIMIT, reencodeProgressLimiter } from '@/lib/config/rate-limit-tiers';
import { signedCallbackRoute } from '@/lib/decorators/signed-callback-route';
import { submissionReencodeJob } from '@/lib/services/submission-attachment-service';
import { submissionReencodeProgressPostSchema } from '@/lib/validation/submission-attachment-schema';

import { dynamic } from './route';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/decorators/signed-callback-route', () => ({
  signedCallbackRoute: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/services/submission-attachment-service', () => ({
  submissionReencodeJob: { kind: 'submission-reencode' },
}));

/** The options this route handed the factory at import, read before any mock is cleared. */
const options = vi.mocked(signedCallbackRoute).mock.calls[0]?.[0];

// The protocol is pinned once, in `signed-callback-route.spec.ts`; this spec
// pins only what this route decides.
describe('POST /api/community/attachments/[id]/reencode/progress', () => {
  it('is the re-encode job’s progress channel, under its own limiter', () => {
    expect(options).toMatchObject({
      job: submissionReencodeJob,
      channel: 'progress',
      schema: submissionReencodeProgressPostSchema,
      limiter: reencodeProgressLimiter,
      limit: REENCODE_PROGRESS_LIMIT,
    });
  });

  it('caps the body at 2 KiB', () => {
    expect(options?.maxBodyBytes).toBe(2 * 1024);
  });

  it('renders dynamically', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
