/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ImageLinksService } from '@/lib/services/image-links-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { addArtistImageSourceLinkAction } from './add-artist-image-source-link-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/image-links-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const link = { id: 'l1', label: 'press.test', url: 'https://press.test/kit' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ImageLinksService.addSourceLink).mockResolvedValue(link);
});

describe('addArtistImageSourceLinkAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await addArtistImageSourceLinkAction({ artistId, url: link.url });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(ImageLinksService.addSourceLink).not.toHaveBeenCalled();
  });

  it('rejects a javascript: URL before touching the service', async () => {
    const result = await addArtistImageSourceLinkAction({ artistId, url: 'javascript:alert(1)' });

    expect(result).toEqual({ success: false, error: 'Links must start with http:// or https://' });
    expect(ImageLinksService.addSourceLink).not.toHaveBeenCalled();
  });

  it('returns Artist not found when the service reports no artist', async () => {
    vi.mocked(ImageLinksService.addSourceLink).mockResolvedValue(null);

    const result = await addArtistImageSourceLinkAction({ artistId, url: link.url });

    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('stores the link, audits it and revalidates the admin list', async () => {
    const result = await addArtistImageSourceLinkAction({ artistId, url: ` ${link.url} ` });

    expect(result).toEqual({ success: true, data: link });
    expect(vi.mocked(ImageLinksService.addSourceLink).mock.calls).toEqual([[artistId, link.url]]);
    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_link.created',
      userId: 'user-123',
      metadata: { artistId, artistBioLinkId: 'l1', role: 'imageSource' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns a typed error when the service throws', async () => {
    vi.mocked(ImageLinksService.addSourceLink).mockRejectedValue(new Error('db'));

    const result = await addArtistImageSourceLinkAction({ artistId, url: link.url });

    expect(result).toEqual({ success: false, error: 'Failed to add link' });
  });
});
