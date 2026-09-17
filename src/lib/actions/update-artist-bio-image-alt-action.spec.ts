/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { updateArtistBioImageAltAction } from './update-artist-bio-image-alt-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const imageId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.updateBioImageAlt).mockResolvedValue(undefined as never);
});

describe('updateArtistBioImageAltAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await updateArtistBioImageAltAction({ imageId, alt: 'x' });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(ArtistService.updateBioImageAlt).not.toHaveBeenCalled();
  });

  it('rejects an invalid image id', async () => {
    const result = await updateArtistBioImageAltAction({ imageId: 'nope', alt: 'x' });

    expect(result).toEqual({ success: false, error: 'Invalid artist bio image ID' });
    expect(ArtistService.updateBioImageAlt).not.toHaveBeenCalled();
  });

  it('rejects alt text over the schema cap', async () => {
    const result = await updateArtistBioImageAltAction({ imageId, alt: 'a'.repeat(501) });

    expect(result.success).toBe(false);
    expect(ArtistService.updateBioImageAlt).not.toHaveBeenCalled();
  });

  it('sanitizes the alt text and updates via the service', async () => {
    const result = await updateArtistBioImageAltAction({ imageId, alt: 'Raw <b>alt</b>' });

    expect(ArtistService.updateBioImageAlt).toHaveBeenCalledWith(imageId, 'clean:Raw <b>alt</b>');
    expect(result).toEqual({ success: true });
  });

  it('passes a null alt through unchanged (clearing)', async () => {
    await updateArtistBioImageAltAction({ imageId, alt: null });

    expect(ArtistService.updateBioImageAlt).toHaveBeenCalledWith(imageId, null);
  });

  it('logs a security event on success', async () => {
    await updateArtistBioImageAltAction({ imageId, alt: 'Alt' });

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.updated',
      userId: 'user-123',
      metadata: { artistBioImageId: imageId },
    });
  });

  it('revalidates the admin artists path on success', async () => {
    await updateArtistBioImageAltAction({ imageId, alt: 'Alt' });

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns the failure copy when the service throws', async () => {
    vi.mocked(ArtistService.updateBioImageAlt).mockRejectedValue(new Error('boom'));

    const result = await updateArtistBioImageAltAction({ imageId, alt: 'Alt' });

    expect(result).toEqual({ success: false, error: 'Failed to update bio image alt text' });
  });
});
