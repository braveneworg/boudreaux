/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { deleteArtistBioLinkAction } from './delete-artist-bio-link-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};

const linkId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.deleteBioLink).mockResolvedValue(undefined as never);
});

describe('deleteArtistBioLinkAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await deleteArtistBioLinkAction(linkId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid artist bio link id', async () => {
    const result = await deleteArtistBioLinkAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid artist bio link ID' });
  });

  it('deletes the bio link via the service', async () => {
    await deleteArtistBioLinkAction(linkId);

    expect(ArtistService.deleteBioLink).toHaveBeenCalledWith(linkId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteArtistBioLinkAction(linkId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteArtistBioLinkAction(linkId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_link.deleted',
      userId: 'user-123',
      metadata: { artistBioLinkId: linkId },
    });
  });

  it('revalidates the admin artists path after deletion', async () => {
    await deleteArtistBioLinkAction(linkId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.deleteBioLink).mockRejectedValue(new Error('Database error'));

    const result = await deleteArtistBioLinkAction(linkId);

    expect(result).toEqual({ success: false, error: 'Failed to delete bio link' });
  });
});
