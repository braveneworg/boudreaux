/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { deleteArtistBioImageAction } from './delete-artist-bio-image-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};

const imageId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.deleteBioImage).mockResolvedValue(undefined as never);
});

describe('deleteArtistBioImageAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await deleteArtistBioImageAction(imageId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid artist bio image id', async () => {
    const result = await deleteArtistBioImageAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist bio image ID' });
  });

  it('deletes the bio image via the service', async () => {
    await deleteArtistBioImageAction(imageId);

    expect(ArtistService.deleteBioImage).toHaveBeenCalledWith(imageId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteArtistBioImageAction(imageId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteArtistBioImageAction(imageId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.deleted',
      userId: 'user-123',
      metadata: { artistBioImageId: imageId },
    });
  });

  it('revalidates the admin artists path after deletion', async () => {
    await deleteArtistBioImageAction(imageId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.deleteBioImage).mockRejectedValue(new Error('Database error'));

    const result = await deleteArtistBioImageAction(imageId);

    expect(result).toEqual({ success: false, error: 'Failed to delete bio image' });
  });
});
