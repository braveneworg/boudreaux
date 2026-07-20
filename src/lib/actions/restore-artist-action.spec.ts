/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { restoreArtistAction } from './restore-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.restoreArtist).mockResolvedValue({
    success: true,
    data: { id: artistId } as never,
  });
});

describe('restoreArtistAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await restoreArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid artist id', async () => {
    const result = await restoreArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist ID' });
  });

  it('restores the artist via the service', async () => {
    await restoreArtistAction(artistId);

    expect(ArtistService.restoreArtist).toHaveBeenCalledWith(artistId);
  });

  it('returns success when the restore succeeds', async () => {
    const result = await restoreArtistAction(artistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful restore', async () => {
    await restoreArtistAction(artistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist.restored',
      userId: 'user-123',
      metadata: { artistId },
    });
  });

  it('revalidates the admin and public artist paths after restore', async () => {
    await restoreArtistAction(artistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ArtistService.restoreArtist).mockResolvedValue({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const result = await restoreArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.restoreArtist).mockRejectedValue(new Error('Database error'));

    const result = await restoreArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Failed to restore artist' });
  });
});
