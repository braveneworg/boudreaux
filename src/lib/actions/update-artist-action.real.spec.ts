/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistService } from '@/lib/services/artist-service';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';

import { updateArtistAction } from './update-artist-action';

// `update-artist-action.spec.ts` mocks `getActionState`; this spec runs the
// real schema against FormData built the way `useUpdateArtistMutation` builds
// it, mocking only the service and framework boundaries (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const ARTIST_ID = '507f1f77bcf86cd799439044';

describe('updateArtistAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1' } } as never);
    vi.mocked(ArtistService.updateArtist).mockResolvedValue({
      success: true,
      data: { id: ARTIST_ID },
    } as never);
  });

  it('saves an artist named "1349" (and the band "311" as an AKA) verbatim', async () => {
    const result = await updateArtistAction(
      ARTIST_ID,
      EMPTY_FORM_STATE,
      objectToFormData({ displayName: '1349', akaNames: '311', slug: '1349' })
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(ArtistService.updateArtist).mock.calls[0][1]).toMatchObject({
      displayName: '1349',
      akaNames: '311',
      slug: '1349',
    });
  });

  it('saves a numeric surname verbatim', async () => {
    const result = await updateArtistAction(
      ARTIST_ID,
      EMPTY_FORM_STATE,
      objectToFormData({ firstName: 'Ann', surname: '1999', slug: 'ann-1999' })
    );

    expect(result.success).toBe(true);
  });
});
