/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ReleaseService } from '@/lib/services/release-service';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';

import { createReleaseAction } from './create-release-action';

// `create-release-action.spec.ts` mocks `getActionState`; this spec runs the
// real schema against FormData built the way `useCreateReleaseMutation` builds
// it, mocking only the service, Prisma, and framework boundaries (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/prisma', () => ({
  prisma: { artistRelease: { createMany: vi.fn() } },
}));
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const ARTIST_ID = '507f1f77bcf86cd799439022';

describe('createReleaseAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1' } } as never);
    vi.mocked(ReleaseService.createRelease).mockResolvedValue({
      success: true,
      data: { id: '507f1f77bcf86cd799439033' },
    } as never);
  });

  it('creates a release titled "1999" with catalog number "001" and price "5.00"', async () => {
    const result = await createReleaseAction(
      EMPTY_FORM_STATE,
      objectToFormData({
        title: '1999',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
        artistIds: [ARTIST_ID],
        catalogNumber: '001',
        suggestedPrice: '5.00',
      })
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ReleaseService.createRelease).mock.calls[0][0]).toMatchObject({
      title: '1999',
      catalogNumber: '001',
      suggestedPrice: 500,
    });
  });
});
