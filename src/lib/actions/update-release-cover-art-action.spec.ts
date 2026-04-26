/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { updateReleaseCoverArtAction } from './update-release-cover-art-action';
import { prisma } from '../prisma';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../prisma', () => ({
  prisma: {
    release: {
      update: vi.fn(),
    },
  },
}));
vi.mock('../utils/auth/require-role');

const VALID_RELEASE_ID = '507f1f77bcf86cd799439011';
const VALID_COVER_URL = 'https://cdn.example.com/cover.webp';

describe('updateReleaseCoverArtAction', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(prisma.release.update).mockResolvedValue({} as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL)).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('rejects malformed release IDs', async () => {
    const result = await updateReleaseCoverArtAction('not-an-objectid', VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'Invalid release ID' });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

  it('rejects empty cover art URL', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, '');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only cover art URL', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, '   ');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

  it('rejects non-string cover art values', async () => {
    const result = await updateReleaseCoverArtAction(
      VALID_RELEASE_ID,
      undefined as unknown as string
    );

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

  it('rejects data URIs', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, 'data:image/png;base64,xxx');

    expect(result).toEqual({ success: false, error: 'Cover art must be an HTTP(S) URL' });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

  it('accepts http:// URLs', async () => {
    const result = await updateReleaseCoverArtAction(
      VALID_RELEASE_ID,
      'http://cdn.example.com/cover.webp'
    );

    expect(result).toEqual({ success: true });
    expect(prisma.release.update).toHaveBeenCalledWith({
      where: { id: VALID_RELEASE_ID },
      data: { coverArt: 'http://cdn.example.com/cover.webp' },
    });
  });

  it('persists the cover art and revalidates affected paths', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: true });
    expect(prisma.release.update).toHaveBeenCalledWith({
      where: { id: VALID_RELEASE_ID },
      data: { coverArt: VALID_COVER_URL },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledWith(`/releases/${VALID_RELEASE_ID}`);
  });

  it('returns the underlying error message when prisma throws Error', async () => {
    vi.mocked(prisma.release.update).mockRejectedValue(new Error('connection lost'));

    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'connection lost' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns a generic message when prisma throws a non-Error value', async () => {
    vi.mocked(prisma.release.update).mockRejectedValue('string error');

    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'Failed to update cover art' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
