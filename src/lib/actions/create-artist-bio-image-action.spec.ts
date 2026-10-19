/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { createArtistBioImageAction } from './create-artist-bio-image-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/logger', () => ({ loggers: { s3: { error: vi.fn() } } }));
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const validInput = { artistId, url: 'https://cdn.example/x.webp', attribution: 'Uploaded' };
const createdRow = { id: 'img-1', artistId, url: 'https://cdn.example/x.webp' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.createBioImage).mockResolvedValue({
    success: true,
    data: createdRow as never,
  });
});

describe('createArtistBioImageAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual(REFUSAL);
    expect(ArtistService.createBioImage).not.toHaveBeenCalled();
  });

  it('rejects invalid input (missing attribution)', async () => {
    const result = await createArtistBioImageAction({
      artistId,
      url: 'https://cdn.example/x.webp',
    } as never);

    expect(result.success).toBe(false);
  });

  it("returns the service's failure", async () => {
    vi.mocked(ArtistService.createBioImage).mockResolvedValueOnce({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Artist not found' });
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('creates the bio image via the service and returns it', async () => {
    const result = await createArtistBioImageAction(validInput);

    expect(vi.mocked(ArtistService.createBioImage).mock.calls).toEqual([
      [{ ...validInput, origin: 'custom', attribution: 'clean:Uploaded' }],
    ]);
    expect(result).toEqual({ success: true, data: createdRow });
  });

  it('sanitizes attribution and title, and leaves alt to the service', async () => {
    const htmlInput = {
      artistId,
      url: 'https://cdn.example/x.webp',
      attribution: 'Photo <b>x</b>',
      title: 'Title <script>evil</script>',
      alt: 'Alt <i>text</i>',
    };

    await createArtistBioImageAction(htmlInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith(
      expect.objectContaining({
        attribution: 'clean:Photo <b>x</b>',
        title: 'clean:Title <script>evil</script>',
        alt: 'Alt <i>text</i>',
      })
    );
  });

  it('passes a null title through without sanitizing', async () => {
    const nullInput = { ...validInput, title: null };

    await createArtistBioImageAction(nullInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith(
      expect.objectContaining({ title: null })
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
