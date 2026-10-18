/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const releaseExistsMock = vi.fn();
const registerForReleaseMock = vi.fn();
const revalidatePathMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

vi.mock('../services/release-service', () => ({
  ReleaseService: { existsById: releaseExistsMock },
}));
vi.mock('../services/image-service', () => ({
  ImageService: {
    registerForRelease: registerForReleaseMock,
  },
}));
vi.mock('../utils/audit-log', () => ({ logSecurityEvent: logSecurityEventMock }));

const { registerReleaseImagesAction } = await import('./register-image-actions');

const adminSession = { user: { id: 'admin-1', role: 'admin' } };
const images = [{ s3Key: 'k1', cdnUrl: 'https://cdn/x', caption: 'c', altText: 'a' }];

describe('registerReleaseImagesAction', () => {
  beforeEach(() => {
    gateActionMock.mockReset();
    releaseExistsMock.mockReset();
    registerForReleaseMock.mockReset();
    revalidatePathMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('returns the gate refusal without touching the release', async () => {
    const refusal = { success: false, error: 'Unauthorized', code: 'FORBIDDEN' };
    gateActionMock.mockResolvedValue(refusal);

    const result = await registerReleaseImagesAction('r1', images);

    expect(result).toEqual(refusal);
    expect(releaseExistsMock).not.toHaveBeenCalled();
  });

  it('returns failure when the image service throws', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
    releaseExistsMock.mockResolvedValue(true);
    registerForReleaseMock.mockRejectedValueOnce(new Error('boom'));
    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: false, error: 'Failed to register images' });
  });

  it('returns Release not found when release does not exist', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
    releaseExistsMock.mockResolvedValue(false);
    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: false, error: 'Release not found' });
  });

  it('registers images and revalidates paths on success', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
    releaseExistsMock.mockResolvedValue(true);
    const results = [{ id: 'img1', src: 'x', sortOrder: 0 }];
    registerForReleaseMock.mockResolvedValue(results);

    const result = await registerReleaseImagesAction('r1', images);
    expect(result).toEqual({ success: true, data: results });
    expect(revalidatePathMock).toHaveBeenCalledWith('/releases');
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/releases');
  });
});
