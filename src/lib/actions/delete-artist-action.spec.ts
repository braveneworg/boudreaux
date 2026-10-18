/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { deleteArtistAction } from './delete-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const artistId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
    success: true,
    data: { id: artistId } as never,
  });
});

describe('deleteArtistAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await deleteArtistAction(artistId);

    expect(result).toEqual(REFUSAL);
    expect(ArtistService.deleteArtist).not.toHaveBeenCalled();
  });

  it('rejects an invalid artist id', async () => {
    const result = await deleteArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist ID', code: 'INVALID_INPUT' });
  });

  it('hard-deletes the artist via the service', async () => {
    await deleteArtistAction(artistId);

    expect(ArtistService.deleteArtist).toHaveBeenCalledWith(artistId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteArtistAction(artistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteArtistAction(artistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist.deleted',
      userId: 'user-123',
      metadata: { artistId },
    });
  });

  it('revalidates the admin and public artist paths after deletion', async () => {
    await deleteArtistAction(artistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const result = await deleteArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Artist not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.deleteArtist).mockRejectedValue(new Error('Database error'));

    const result = await deleteArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Failed to delete artist', code: 'UNKNOWN' });
  });
});
