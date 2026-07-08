/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { createArtistBioLinkAction } from './create-artist-bio-link-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));
vi.mock('@/lib/utils/sanitization', () => ({ sanitizeUrl: (s: string) => `safe:${s}` }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const validInput = { artistId, label: 'Official', url: 'https://example.com' };
const createdRow = { id: 'link-1', artistId, label: 'Official', url: 'https://example.com' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.existsById).mockResolvedValue(true);
  vi.mocked(ArtistService.createBioLink).mockResolvedValue(createdRow as never);
});

describe('createArtistBioLinkAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await createArtistBioLinkAction(validInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects invalid input (javascript: url)', async () => {
    const result = await createArtistBioLinkAction({
      artistId,
      label: 'x',
      url: 'javascript:alert(1)',
    } as never);

    expect(result.success).toBe(false);
  });

  it('returns Artist not found when the artist does not exist', async () => {
    vi.mocked(ArtistService.existsById).mockResolvedValue(false);

    const result = await createArtistBioLinkAction(validInput);

    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('creates the bio link via the service with sanitized fields and origin custom', async () => {
    const result = await createArtistBioLinkAction({ ...validInput, kind: 'official' });

    expect(ArtistService.createBioLink).toHaveBeenCalledWith({
      artistId,
      origin: 'custom',
      label: 'clean:Official',
      url: 'safe:https://example.com',
      kind: 'official',
    });
    expect(result).toEqual({ success: true, data: createdRow });
  });

  it('omits kind when none is supplied', async () => {
    await createArtistBioLinkAction(validInput);

    expect(ArtistService.createBioLink).toHaveBeenCalledWith({
      artistId,
      origin: 'custom',
      label: 'clean:Official',
      url: 'safe:https://example.com',
    });
  });

  it('logs a security event on success', async () => {
    await createArtistBioLinkAction(validInput);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_link.created',
      userId: 'user-123',
      metadata: { artistId, artistBioLinkId: 'link-1' },
    });
  });

  it('revalidates the admin artists path on success', async () => {
    await createArtistBioLinkAction(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.createBioLink).mockRejectedValue(new Error('db'));

    const result = await createArtistBioLinkAction(validInput);

    expect(result).toEqual({ success: false, error: 'Failed to add bio link' });
  });
});
