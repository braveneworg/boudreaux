/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { publishFeaturedArtistAction } from './publish-featured-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/featured-artists-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const featuredArtistId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(FeaturedArtistsService.publishFeaturedArtist).mockResolvedValue({
    success: true,
    data: { id: featuredArtistId } as never,
  });
});

describe('publishFeaturedArtistAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await publishFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid featured artist id', async () => {
    const result = await publishFeaturedArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid featured artist ID' });
  });

  it('publishes the featured artist via the service', async () => {
    await publishFeaturedArtistAction(featuredArtistId);

    expect(FeaturedArtistsService.publishFeaturedArtist).toHaveBeenCalledWith(featuredArtistId);
  });

  it('returns success when the publish succeeds', async () => {
    const result = await publishFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful publish', async () => {
    await publishFeaturedArtistAction(featuredArtistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.featured_artist.published',
      userId: 'user-123',
      metadata: { featuredArtistId },
    });
  });

  it('revalidates the admin and home paths after publish', async () => {
    await publishFeaturedArtistAction(featuredArtistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/featured-artists');
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(FeaturedArtistsService.publishFeaturedArtist).mockResolvedValue({
      success: false,
      error: 'Featured artist not found',
    });

    const result = await publishFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Featured artist not found' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(FeaturedArtistsService.publishFeaturedArtist).mockRejectedValue(
      new Error('Database error')
    );

    const result = await publishFeaturedArtistAction(featuredArtistId);

    expect(result).toEqual({ success: false, error: 'Failed to publish featured artist' });
  });
});
