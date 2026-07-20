/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { deleteFeaturedArtistAction } from './delete-featured-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/featured-artists-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};

const featuredArtistId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
    success: true,
    data: { id: featuredArtistId } as never,
  });
});

describe('deleteFeaturedArtistAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await deleteFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid featured artist id', async () => {
    const result = await deleteFeaturedArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid featured artist ID' });
  });

  it('hard-deletes the featured artist via the service', async () => {
    await deleteFeaturedArtistAction(featuredArtistId);

    expect(FeaturedArtistsService.hardDeleteFeaturedArtist).toHaveBeenCalledWith(featuredArtistId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteFeaturedArtistAction(featuredArtistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.featured_artist.deleted',
      userId: 'user-123',
      metadata: { featuredArtistId },
    });
  });

  it('revalidates the admin and home paths after deletion', async () => {
    await deleteFeaturedArtistAction(featuredArtistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/featured-artists');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
      success: false,
      error: 'Featured artist not found',
      code: 'NOT_FOUND',
    });

    const result = await deleteFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Featured artist not found' });
  });

  it('does not log a security event when the service fails', async () => {
    vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
      success: false,
      error: 'Featured artist not found',
      code: 'NOT_FOUND',
    });

    await deleteFeaturedArtistAction(featuredArtistId);

    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockRejectedValue(
      new Error('Database error')
    );

    const result = await deleteFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Failed to delete featured artist' });
  });
});
