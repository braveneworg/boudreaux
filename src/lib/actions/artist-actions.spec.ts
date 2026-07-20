/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const createArtistMock = vi.fn();

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { createArtist: createArtistMock },
}));

const { createArtistAction } = await import('./artist-actions');

const baseArtist = {
  id: 'a1',
  firstName: 'Jane',
  surname: 'Doe',
  slug: 'jane-doe',
  images: [],
  urls: [],
  labels: [],
  releases: [],
};

describe('createArtistAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    createArtistMock.mockReset();
  });

  it('returns failure when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(new Error('forbidden'));
    const result = await createArtistAction(baseArtist as never);
    expect(result).toEqual({
      success: false,
      error: 'Failed to create artist',
      code: 'UNKNOWN',
    });
    expect(createArtistMock).not.toHaveBeenCalled();
  });

  it('passes through the service result on success', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    createArtistMock.mockResolvedValue({ success: true, data: { id: 'a1' } });
    const result = await createArtistAction(baseArtist as never);
    expect(result).toEqual({ success: true, data: { id: 'a1' } });
    expect(createArtistMock).toHaveBeenCalledTimes(1);
  });

  it('forwards image and url inputs to the service (repo builds connectOrCreate)', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    createArtistMock.mockResolvedValue({ success: true, data: { id: 'a1' } });
    await createArtistAction({
      ...baseArtist,
      images: [{ id: 'img1', src: 'x', altText: null, caption: null }],
      urls: [{ id: 'url1', platform: 'SPOTIFY', url: 'https://example.com' }],
    } as never);

    const arg = createArtistMock.mock.calls[0][0];
    expect(arg.images).toEqual([{ id: 'img1', src: 'x', altText: null, caption: null }]);
    expect(arg.urls).toEqual([{ id: 'url1', platform: 'SPOTIFY', url: 'https://example.com' }]);
  });

  it('returns failure when the service throws', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    createArtistMock.mockRejectedValue(new Error('service down'));
    const result = await createArtistAction(baseArtist as never);
    expect(result).toEqual({
      success: false,
      error: 'Failed to create artist',
      code: 'UNKNOWN',
    });
  });
});
