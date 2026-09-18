/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { setArtistDisplayImagesAction } from './set-artist-display-images-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const imageIds = ['665f1f77bcf86cd799439021', '665f1f77bcf86cd799439022'];
const validInput = { artistId, imageIds };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.setDisplayImages).mockResolvedValue({
    success: true,
    data: { slug: 'ceschi' },
  });
});

describe('setArtistDisplayImagesAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await setArtistDisplayImagesAction(validInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(ArtistService.setDisplayImages).not.toHaveBeenCalled();
  });

  it('rejects invalid input before reaching the service', async () => {
    const result = await setArtistDisplayImagesAction({ artistId, imageIds: ['nope'] });

    expect(result.success).toBe(false);
    expect(ArtistService.setDisplayImages).not.toHaveBeenCalled();
  });

  it('rejects a repeated id with the schema message', async () => {
    const result = await setArtistDisplayImagesAction({
      artistId,
      imageIds: [imageIds[0], imageIds[0]],
    });

    expect(result).toEqual({ success: false, error: 'Each image can be chosen only once' });
  });

  it('forwards the ordered ids to the service', async () => {
    await setArtistDisplayImagesAction(validInput);

    expect(ArtistService.setDisplayImages).toHaveBeenCalledWith(artistId, imageIds);
  });

  it('returns success once the service accepts the set', async () => {
    const result = await setArtistDisplayImagesAction(validInput);

    expect(result).toEqual({ success: true });
  });

  it('surfaces the service failure copy and code', async () => {
    vi.mocked(ArtistService.setDisplayImages).mockResolvedValue({
      success: false,
      error: 'Add alt text before using an image as a display image',
      code: 'VALIDATION',
    });

    const result = await setArtistDisplayImagesAction(validInput);

    expect(result).toEqual({
      success: false,
      error: 'Add alt text before using an image as a display image',
      code: 'VALIDATION',
    });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('logs a security event on success', async () => {
    await setArtistDisplayImagesAction(validInput);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_display_images.updated',
      userId: 'user-123',
      metadata: { artistId, artistBioImageIds: imageIds },
    });
  });

  it('revalidates the admin list, the public index, and the artist page', async () => {
    await setArtistDisplayImagesAction(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists/ceschi');
  });

  it('returns a generic failure when the service throws', async () => {
    vi.mocked(ArtistService.setDisplayImages).mockRejectedValue(new Error('boom'));

    const result = await setArtistDisplayImagesAction(validInput);

    expect(result).toEqual({ success: false, error: 'Failed to update display images' });
  });
});
