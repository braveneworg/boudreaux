/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { createArtistBioImageAction } from './create-artist-bio-image-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({ loggers: { s3: { error: vi.fn() } } }));
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const validInput = { artistId, url: 'https://cdn.example/x.webp', attribution: 'Uploaded' };
const createdRow = { id: 'img-1', artistId, url: 'https://cdn.example/x.webp' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.existsById).mockResolvedValue(true);
  vi.mocked(ArtistService.createBioImage).mockResolvedValue(createdRow as never);
});

describe('createArtistBioImageAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects invalid input (missing attribution)', async () => {
    const result = await createArtistBioImageAction({
      artistId,
      url: 'https://cdn.example/x.webp',
    } as never);

    expect(result.success).toBe(false);
  });

  it('returns Artist not found when the artist does not exist', async () => {
    vi.mocked(ArtistService.existsById).mockResolvedValue(false);

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('creates the bio image via the service and returns it', async () => {
    const result = await createArtistBioImageAction(validInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith({
      ...validInput,
      origin: 'custom',
      attribution: 'clean:Uploaded',
    });
    expect(result).toEqual({ success: true, data: createdRow });
  });

  it('sanitizes attribution, title, and alt before creating', async () => {
    const htmlInput = {
      artistId,
      url: 'https://cdn.example/x.webp',
      attribution: 'Photo <b>x</b>',
      title: 'Title <script>evil</script>',
      alt: 'Alt <i>text</i>',
    };
    vi.mocked(ArtistService.createBioImage).mockResolvedValue({ ...createdRow } as never);

    await createArtistBioImageAction(htmlInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith(
      expect.objectContaining({
        attribution: 'clean:Photo <b>x</b>',
        title: 'clean:Title <script>evil</script>',
        alt: 'clean:Alt <i>text</i>',
      })
    );
  });

  it('passes null title and alt through without sanitizing', async () => {
    const nullInput = { ...validInput, title: null, alt: null };

    await createArtistBioImageAction(nullInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, alt: null })
    );
  });

  it('logs a security event on success', async () => {
    await createArtistBioImageAction(validInput);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.created',
      userId: 'user-123',
      metadata: { artistId, artistBioImageId: 'img-1' },
    });
  });

  it('revalidates the admin artists path on success', async () => {
    await createArtistBioImageAction(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.createBioImage).mockRejectedValue(new Error('db'));

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Failed to add bio image' });
  });
});
