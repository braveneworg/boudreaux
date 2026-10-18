/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ImageLinksService } from '@/lib/services/image-links-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { removeArtistImageSourceLinkAction } from './remove-artist-image-source-link-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/image-links-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const linkId = '507f1f77bcf86cd799439022';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ImageLinksService.removeSourceLink).mockResolvedValue(true);
});

describe('removeArtistImageSourceLinkAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await removeArtistImageSourceLinkAction({ artistId, linkId });

    expect(result).toEqual(REFUSAL);
    expect(ImageLinksService.removeSourceLink).not.toHaveBeenCalled();
  });

  it('rejects a malformed link id', async () => {
    const result = await removeArtistImageSourceLinkAction({ artistId, linkId: 'nope' });

    expect(result.success).toBe(false);
    expect(ImageLinksService.removeSourceLink).not.toHaveBeenCalled();
  });

  it('returns Link not found when nothing was removed', async () => {
    vi.mocked(ImageLinksService.removeSourceLink).mockResolvedValue(false);

    const result = await removeArtistImageSourceLinkAction({ artistId, linkId });

    expect(result).toEqual({ success: false, error: 'Link not found' });
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('removes the role, audits and revalidates', async () => {
    const result = await removeArtistImageSourceLinkAction({ artistId, linkId });

    expect(result).toEqual({ success: true });
    expect(vi.mocked(ImageLinksService.removeSourceLink).mock.calls).toEqual([[artistId, linkId]]);
    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_link.deleted',
      userId: 'user-123',
      metadata: { artistId, artistBioLinkId: linkId, role: 'imageSource' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns a typed error when the service throws', async () => {
    vi.mocked(ImageLinksService.removeSourceLink).mockRejectedValue(new Error('db'));

    const result = await removeArtistImageSourceLinkAction({ artistId, linkId });

    expect(result).toEqual({ success: false, error: 'Failed to remove link' });
  });
});
