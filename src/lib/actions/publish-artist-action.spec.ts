/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { publishArtistAction } from './publish-artist-action';

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
  vi.mocked(ArtistService.publishArtist).mockResolvedValue({
    success: true,
    data: { id: artistId } as never,
  });
});

describe('publishArtistAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await publishArtistAction(artistId);

    expect(result).toEqual(REFUSAL);
    expect(ArtistService.publishArtist).not.toHaveBeenCalled();
  });

  it('rejects an invalid artist id', async () => {
    const result = await publishArtistAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist ID', code: 'INVALID_INPUT' });
  });

  it('publishes the artist via the service', async () => {
    await publishArtistAction(artistId);

    expect(ArtistService.publishArtist).toHaveBeenCalledWith(artistId, 'user-123');
  });

  it('returns success when the publish succeeds', async () => {
    const result = await publishArtistAction(artistId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful publish', async () => {
    await publishArtistAction(artistId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist.published',
      userId: 'user-123',
      metadata: { artistId },
    });
  });

  it('revalidates the admin and public artist paths after publish', async () => {
    await publishArtistAction(artistId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ArtistService.publishArtist).mockResolvedValue({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const result = await publishArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Artist not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.publishArtist).mockRejectedValue(new Error('Database error'));

    const result = await publishArtistAction(artistId);

    expect(result).toEqual({ success: false, error: 'Failed to publish artist', code: 'UNKNOWN' });
  });
});
