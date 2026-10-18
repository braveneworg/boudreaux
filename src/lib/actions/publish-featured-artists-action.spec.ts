/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment node
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { cache } from '@/lib/utils/simple-cache';

import { publishFeaturedArtistsToSiteAction } from './publish-featured-artists-action';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/action-gate');

vi.mock('@/lib/utils/simple-cache', () => ({
  cache: {
    deleteByPrefix: vi.fn(),
  },
}));

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

describe('publishFeaturedArtistsToSiteAction', () => {
  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'admin-1', role: 'admin' } } as never,
    });
    vi.mocked(cache.deleteByPrefix).mockReturnValue(2);
  });

  it('returns the gate refusal without clearing the cache', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual(REFUSAL);
    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });

  it('calls cache.deleteByPrefix with the correct prefix', async () => {
    await publishFeaturedArtistsToSiteAction();

    expect(cache.deleteByPrefix).toHaveBeenCalledWith('featured-artists:');
  });

  it('calls revalidatePath with "/"', async () => {
    await publishFeaturedArtistsToSiteAction();

    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns success true on successful cache invalidation', async () => {
    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual({ success: true });
  });

  it('returns error when cache.deleteByPrefix throws', async () => {
    vi.mocked(cache.deleteByPrefix).mockImplementationOnce(() => {
      throw new Error('Cache error');
    });

    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual({
      success: false,
      error: 'Failed to publish featured artists to landing page',
      code: 'UNKNOWN',
    });
  });
});
