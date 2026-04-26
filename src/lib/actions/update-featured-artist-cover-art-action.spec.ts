/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { updateFeaturedArtistCoverArtAction } from './update-featured-artist-cover-art-action';
import { prisma } from '../prisma';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../prisma', () => ({
  prisma: {
    featuredArtist: {
      update: vi.fn(),
    },
  },
}));
vi.mock('../utils/auth/require-role');

const VALID_FEATURED_ARTIST_ID = '507f1f77bcf86cd799439011';
const VALID_COVER_URL = 'https://cdn.example.com/cover.webp';

describe('updateFeaturedArtistCoverArtAction', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(prisma.featuredArtist.update).mockResolvedValue({} as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(
      updateFeaturedArtistCoverArtAction(VALID_FEATURED_ARTIST_ID, VALID_COVER_URL)
    ).rejects.toThrow('Unauthorized');
  });

  it('rejects malformed featured artist IDs', async () => {
    const result = await updateFeaturedArtistCoverArtAction('not-an-objectid', VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'Invalid featured artist ID' });
    expect(prisma.featuredArtist.update).not.toHaveBeenCalled();
  });

  it('rejects empty cover art URL', async () => {
    const result = await updateFeaturedArtistCoverArtAction(VALID_FEATURED_ARTIST_ID, '');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.featuredArtist.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only cover art URL', async () => {
    const result = await updateFeaturedArtistCoverArtAction(VALID_FEATURED_ARTIST_ID, '   ');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.featuredArtist.update).not.toHaveBeenCalled();
  });

  it('rejects non-string cover art values', async () => {
    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      undefined as unknown as string
    );

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.featuredArtist.update).not.toHaveBeenCalled();
  });

  it('rejects data URIs', async () => {
    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      'data:image/png;base64,xxx'
    );

    expect(result).toEqual({ success: false, error: 'Cover art must be an HTTP(S) URL' });
    expect(prisma.featuredArtist.update).not.toHaveBeenCalled();
  });

  it('accepts http:// URLs', async () => {
    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      'http://cdn.example.com/cover.webp'
    );

    expect(result).toEqual({ success: true });
    expect(prisma.featuredArtist.update).toHaveBeenCalledWith({
      where: { id: VALID_FEATURED_ARTIST_ID },
      data: { coverArt: 'http://cdn.example.com/cover.webp' },
    });
  });

  it('persists the cover art and revalidates the home page', async () => {
    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      VALID_COVER_URL
    );

    expect(result).toEqual({ success: true });
    expect(prisma.featuredArtist.update).toHaveBeenCalledWith({
      where: { id: VALID_FEATURED_ARTIST_ID },
      data: { coverArt: VALID_COVER_URL },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns the underlying error message when prisma throws Error', async () => {
    vi.mocked(prisma.featuredArtist.update).mockRejectedValue(new Error('connection lost'));

    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      VALID_COVER_URL
    );

    expect(result).toEqual({ success: false, error: 'connection lost' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns a generic message when prisma throws a non-Error value', async () => {
    vi.mocked(prisma.featuredArtist.update).mockRejectedValue('string error');

    const result = await updateFeaturedArtistCoverArtAction(
      VALID_FEATURED_ARTIST_ID,
      VALID_COVER_URL
    );

    expect(result).toEqual({ success: false, error: 'Failed to update cover art' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
