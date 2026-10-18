/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { updateArtistBioImageAttributionAction } from './update-artist-bio-image-attribution-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const imageId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.updateBioImageAttribution).mockResolvedValue(undefined as never);
});

describe('updateArtistBioImageAttributionAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await updateArtistBioImageAttributionAction({ imageId, attribution: 'x' });

    expect(result).toEqual(REFUSAL);
    expect(ArtistService.updateBioImageAttribution).not.toHaveBeenCalled();
  });

  it('rejects an invalid image id', async () => {
    const result = await updateArtistBioImageAttributionAction({
      imageId: 'nope',
      attribution: 'x',
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid artist bio image ID',
      code: 'INVALID_INPUT',
    });
    expect(ArtistService.updateBioImageAttribution).not.toHaveBeenCalled();
  });

  it('sanitizes the attribution and updates via the service', async () => {
    const result = await updateArtistBioImageAttributionAction({
      imageId,
      attribution: 'Raw <b>credit</b>',
    });

    expect(ArtistService.updateBioImageAttribution).toHaveBeenCalledWith(
      imageId,
      'clean:Raw <b>credit</b>'
    );
    expect(result).toEqual({ success: true });
  });

  it('passes a null attribution through unchanged (clearing)', async () => {
    await updateArtistBioImageAttributionAction({ imageId, attribution: null });

    expect(ArtistService.updateBioImageAttribution).toHaveBeenCalledWith(imageId, null);
  });

  it('logs a security event on success', async () => {
    await updateArtistBioImageAttributionAction({ imageId, attribution: 'Credit' });

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.updated',
      userId: 'user-123',
      metadata: { artistBioImageId: imageId },
    });
  });

  it('revalidates the admin artists path on success', async () => {
    await updateArtistBioImageAttributionAction({ imageId, attribution: 'Credit' });

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });
});
