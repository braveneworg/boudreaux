/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment node

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../utils/auth/require-role', () => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/utils/simple-cache', () => ({
  cache: {
    deleteByPrefix: vi.fn().mockReturnValue(2),
  },
}));

describe('publishFeaturedArtistsToSiteAction', () => {
  it('returns unauthorized when requireRole rejects', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('does not clear cache when unauthorized', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { cache } = await import('@/lib/utils/simple-cache');
    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    await publishFeaturedArtistsToSiteAction();

    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });

  it('calls cache.deleteByPrefix with the correct prefix', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);

    const { cache } = await import('@/lib/utils/simple-cache');
    vi.mocked(cache.deleteByPrefix).mockReturnValue(2);
    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    await publishFeaturedArtistsToSiteAction();

    expect(cache.deleteByPrefix).toHaveBeenCalledWith('featured-artists:');
  });

  it('calls revalidatePath with "/"', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);

    const { cache } = await import('@/lib/utils/simple-cache');
    vi.mocked(cache.deleteByPrefix).mockReturnValue(2);
    const { revalidatePath } = await import('next/cache');
    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    await publishFeaturedArtistsToSiteAction();

    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns success true on successful cache invalidation', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);

    const { cache } = await import('@/lib/utils/simple-cache');
    vi.mocked(cache.deleteByPrefix).mockReturnValue(2);
    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual({ success: true });
  });

  it('returns error when cache.deleteByPrefix throws', async () => {
    const { requireRole } = await import('../utils/auth/require-role');
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);

    const { cache } = await import('@/lib/utils/simple-cache');
    vi.mocked(cache.deleteByPrefix).mockImplementation(() => {
      throw new Error('Cache error');
    });

    const { publishFeaturedArtistsToSiteAction } =
      await import('./publish-featured-artists-action');
    const result = await publishFeaturedArtistsToSiteAction();

    expect(result).toEqual({
      success: false,
      error: 'Failed to publish featured artists to landing page',
    });
  });
});
