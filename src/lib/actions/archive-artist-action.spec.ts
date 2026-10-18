/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { archiveArtistAction } from './archive-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const artistId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
    success: true,
    data: { id: artistId } as never,
  });
});

describe('archiveArtistAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await archiveArtistAction(artistId);

    expect(result).toEqual(REFUSAL);
    expect(ArtistService.archiveArtist).not.toHaveBeenCalled();
  });

  it('rejects an invalid artist id', async () => {
    const result = await archiveArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist ID', code: 'INVALID_INPUT' });
  });

  it('soft-deletes the artist via the archive service', async () => {
    await archiveArtistAction(artistId);

    expect(ArtistService.archiveArtist).toHaveBeenCalledWith(artistId);
  });

  it('returns success when the archive succeeds', async () => {
    const result = await archiveArtistAction(artistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful archive', async () => {
    await archiveArtistAction(artistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist.archived',
      userId: 'user-123',
      metadata: { artistId },
    });
  });

  it('revalidates the admin and public artist paths after archive', async () => {
    await archiveArtistAction(artistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const result = await archiveArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Artist not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.archiveArtist).mockRejectedValue(new Error('Database error'));

    const result = await archiveArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Failed to archive artist', code: 'UNKNOWN' });
  });
});
