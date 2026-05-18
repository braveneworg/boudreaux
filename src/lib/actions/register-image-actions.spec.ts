/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const authMock = vi.fn();
const artistExistsMock = vi.fn();
const releaseExistsMock = vi.fn();
const registerForArtistMock = vi.fn();
const registerForReleaseMock = vi.fn();
const revalidatePathMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('../services/artist-service', () => ({
  ArtistService: { existsById: artistExistsMock },
}));
vi.mock('../services/release-service', () => ({
  ReleaseService: { existsById: releaseExistsMock },
}));
vi.mock('../services/image-service', () => ({
  ImageService: {
    registerForArtist: registerForArtistMock,
    registerForRelease: registerForReleaseMock,
  },
}));
vi.mock('../utils/audit-log', () => ({ logSecurityEvent: logSecurityEventMock }));

const { registerArtistImagesAction, registerReleaseImagesAction } =
  await import('./register-image-actions');

const adminSession = { user: { id: 'admin-1', role: 'admin' } };
const images = [{ s3Key: 'k1', cdnUrl: 'https://cdn/x', caption: 'c', altText: 'a' }];

describe('registerArtistImagesAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    authMock.mockReset();
    artistExistsMock.mockReset();
    registerForArtistMock.mockReset();
    revalidatePathMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('rejects when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(new Error('forbidden'));
    await expect(registerArtistImagesAction('a1', images)).rejects.toThrow('forbidden');
  });

  it('returns Unauthorized when session lacks admin role', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const result = await registerArtistImagesAction('a1', images);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns Artist not found when artist does not exist', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    artistExistsMock.mockResolvedValue(false);
    const result = await registerArtistImagesAction('a1', images);
    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('registers images and revalidates paths on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    artistExistsMock.mockResolvedValue(true);
    const results = [{ id: 'img1', src: 'x', sortOrder: 0 }];
    registerForArtistMock.mockResolvedValue(results);

    const result = await registerArtistImagesAction('a1', images);
    expect(result).toEqual({ success: true, data: results });
    expect(registerForArtistMock).toHaveBeenCalledWith('a1', [
      { cdnUrl: 'https://cdn/x', caption: 'c', altText: 'a' },
    ]);
    expect(logSecurityEventMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/artists/[slug]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns failure when the image service throws', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    artistExistsMock.mockResolvedValue(true);
    registerForArtistMock.mockRejectedValue(new Error('boom'));
    const result = await registerArtistImagesAction('a1', images);
    expect(result).toEqual({ success: false, error: 'Failed to register images' });
  });
});

describe('registerReleaseImagesAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    authMock.mockReset();
    releaseExistsMock.mockReset();
    registerForReleaseMock.mockReset();
    revalidatePathMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('returns Release not found when release does not exist', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    releaseExistsMock.mockResolvedValue(false);
    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: false, error: 'Release not found' });
  });

  it('registers images and revalidates paths on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    releaseExistsMock.mockResolvedValue(true);
    const results = [{ id: 'img1', src: 'x', sortOrder: 0 }];
    registerForReleaseMock.mockResolvedValue(results);

    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: true, data: results });
    expect(revalidatePathMock).toHaveBeenCalledWith('/releases/[slug]', 'page');
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/releases');
  });

  it('returns Unauthorized when session lacks admin role', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });
});
