/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { requireRole } from '@/utils/auth/require-role';

import { updateReleaseCoverArtAction } from './update-release-cover-art-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('../repositories/release-repository');
vi.mock('../utils/auth/require-role');

const VALID_RELEASE_ID = '507f1f77bcf86cd799439011';
const VALID_COVER_URL = 'https://cdn.example.com/cover.webp';

describe('updateReleaseCoverArtAction', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(ReleaseRepository.updateData).mockResolvedValue({} as never);
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
    expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
  });

  it('rejects empty cover art URL', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, '');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only cover art URL', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, '   ');

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
  });

  it('rejects non-string cover art values', async () => {
    const result = await updateReleaseCoverArtAction(
      VALID_RELEASE_ID,
      undefined as unknown as string
    );

    expect(result).toEqual({ success: false, error: 'Cover art URL is required' });
    expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
  });

  it('rejects data URIs', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, 'data:image/png;base64,xxx');

    expect(result).toEqual({ success: false, error: 'Cover art must be an HTTP(S) URL' });
    expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
  });

  it('accepts http:// URLs', async () => {
    const result = await updateReleaseCoverArtAction(
      VALID_RELEASE_ID,
      'http://cdn.example.com/cover.webp'
    );

    expect(result).toEqual({ success: true });
    expect(vi.mocked(ReleaseRepository.updateData).mock.calls).toEqual([
      [VALID_RELEASE_ID, { coverArt: 'http://cdn.example.com/cover.webp' }],
    ]);
  });

  it('persists the cover art and revalidates affected paths', async () => {
    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: true });
    expect(vi.mocked(ReleaseRepository.updateData).mock.calls).toEqual([
      [VALID_RELEASE_ID, { coverArt: VALID_COVER_URL }],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledWith(`/releases/${VALID_RELEASE_ID}`);
  });

  it('returns the underlying error message when the repository throws an Error', async () => {
    vi.mocked(ReleaseRepository.updateData).mockRejectedValue(new Error('connection lost'));

    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'connection lost' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns a generic message when the repository throws a non-Error value', async () => {
    vi.mocked(ReleaseRepository.updateData).mockRejectedValue('string error');

    const result = await updateReleaseCoverArtAction(VALID_RELEASE_ID, VALID_COVER_URL);

    expect(result).toEqual({ success: false, error: 'Failed to update cover art' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
