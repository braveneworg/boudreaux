/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistService } from '@/lib/services/artist-service';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';

import { createArtistAction } from './create-artist-action';

// `create-artist-action.spec.ts` mocks `getActionState`; this spec runs the
// real schema against FormData built the way `useCreateArtistMutation` builds
// it, mocking only the service and framework boundaries (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

describe('createArtistAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1' } } as never);
    vi.mocked(ArtistService.createArtist).mockResolvedValue({
      success: true,
      data: { id: '507f1f77bcf86cd799439044' },
    } as never);
  });

  it('creates an artist named "1349" with the slug "1349"', async () => {
    const result = await createArtistAction(
      EMPTY_FORM_STATE,
      objectToFormData({ displayName: '1349', slug: '1349' })
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ArtistService.createArtist).mock.calls[0][0]).toMatchObject({
      displayName: '1349',
      slug: '1349',
    });
  });
});
