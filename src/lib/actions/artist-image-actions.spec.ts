/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const authMock = vi.fn();
const uploadArtistImagesMock = vi.fn();
const deleteArtistImageMock = vi.fn();
const getArtistImagesMock = vi.fn();
const updateArtistImageMock = vi.fn();
const reorderArtistImagesMock = vi.fn();
const revalidatePathMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('../services/artist-service', () => ({
  ArtistService: {
    uploadArtistImages: uploadArtistImagesMock,
    deleteArtistImage: deleteArtistImageMock,
    getArtistImages: getArtistImagesMock,
    updateArtistImage: updateArtistImageMock,
    reorderArtistImages: reorderArtistImagesMock,
  },
}));
vi.mock('../utils/audit-log', () => ({ logSecurityEvent: logSecurityEventMock }));

const {
  uploadArtistImagesAction,
  deleteArtistImageAction,
  getArtistImagesAction,
  updateArtistImageAction,
  reorderArtistImagesAction,
} = await import('./artist-image-actions');

const adminSession = { user: { id: 'admin-1', role: 'admin' } };

const buildUploadForm = (
  files: File[],
  captions: string[] = [],
  altTexts: string[] = []
): FormData => {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  for (const c of captions) fd.append('captions', c);
  for (const a of altTexts) fd.append('altTexts', a);
  return fd;
};

const jpegFile = new File([new Uint8Array([0xff, 0xd8])], 'a.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  requireRoleMock.mockReset();
  authMock.mockReset();
  uploadArtistImagesMock.mockReset();
  deleteArtistImageMock.mockReset();
  getArtistImagesMock.mockReset();
  updateArtistImageMock.mockReset();
  reorderArtistImagesMock.mockReset();
  revalidatePathMock.mockReset();
  logSecurityEventMock.mockReset();
});

describe('uploadArtistImagesAction', () => {
  it('returns Unauthorized when session lacks admin role', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const result = await uploadArtistImagesAction('a1', buildUploadForm([jpegFile]));
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns error when no files are provided', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    const result = await uploadArtistImagesAction('a1', new FormData());
    expect(result).toEqual({ success: false, error: 'No files provided' });
  });

  it('rejects disallowed mime types', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    const bad = new File([new Uint8Array([1])], 'x.svg', { type: 'image/svg+xml' });
    const result = await uploadArtistImagesAction('a1', buildUploadForm([bad]));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid file type');
  });

  it('rejects files exceeding the 5MB size cap', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    const result = await uploadArtistImagesAction('a1', buildUploadForm([big]));
    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds maximum size');
  });

  it('uploads images and revalidates paths on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    uploadArtistImagesMock.mockResolvedValue({
      success: true,
      data: [{ id: 'i1', src: 'x', sortOrder: 0 }],
    });

    const result = await uploadArtistImagesAction(
      'a1',
      buildUploadForm([jpegFile], ['cap'], ['alt'])
    );

    expect(result.success).toBe(true);
    expect(uploadArtistImagesMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns failure when service throws', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    uploadArtistImagesMock.mockRejectedValue(new Error('boom'));
    const result = await uploadArtistImagesAction('a1', buildUploadForm([jpegFile]));
    expect(result).toEqual({ success: false, error: 'Failed to upload images' });
  });
});

describe('deleteArtistImageAction', () => {
  it('returns Unauthorized when not admin', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u', role: 'user' } });
    const result = await deleteArtistImageAction('img1');
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('deletes image and revalidates on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    deleteArtistImageMock.mockResolvedValue({ success: true });
    const result = await deleteArtistImageAction('img1');
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/artists');
  });

  it('passes through service error on failure', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    deleteArtistImageMock.mockResolvedValue({ success: false, error: 'not found' });
    const result = await deleteArtistImageAction('img1');
    expect(result).toEqual({ success: false, error: 'not found' });
  });
});

describe('getArtistImagesAction', () => {
  it('returns images on success', async () => {
    getArtistImagesMock.mockResolvedValue({
      success: true,
      data: [{ id: 'i1', src: 'x', sortOrder: 0 }],
    });
    const result = await getArtistImagesAction('a1');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('returns failure on service failure', async () => {
    getArtistImagesMock.mockResolvedValue({ success: false, error: 'not found' });
    const result = await getArtistImagesAction('a1');
    expect(result).toEqual({ success: false, error: 'not found' });
  });

  it('returns failure when service throws', async () => {
    getArtistImagesMock.mockRejectedValue(new Error('boom'));
    const result = await getArtistImagesAction('a1');
    expect(result).toEqual({ success: false, error: 'Failed to retrieve images' });
  });
});

describe('updateArtistImageAction', () => {
  it('returns Unauthorized when not admin', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u', role: 'user' } });
    const result = await updateArtistImageAction('img1', { caption: 'c' });
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('updates image on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    updateArtistImageMock.mockResolvedValue({ success: true });
    const result = await updateArtistImageAction('img1', { caption: 'c', altText: 'a' });
    expect(result).toEqual({ success: true });
    expect(updateArtistImageMock).toHaveBeenCalledWith('img1', { caption: 'c', altText: 'a' });
  });
});

describe('reorderArtistImagesAction', () => {
  it('returns Unauthorized when not admin', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue({ user: { id: 'u', role: 'user' } });
    const result = await reorderArtistImagesAction('a1', ['i1']);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects empty image id list', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    const result = await reorderArtistImagesAction('a1', []);
    expect(result).toEqual({ success: false, error: 'No image IDs provided' });
  });

  it('reorders and revalidates on success', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    authMock.mockResolvedValue(adminSession);
    reorderArtistImagesMock.mockResolvedValue({
      success: true,
      data: [{ id: 'i1', src: 'x', sortOrder: 0 }],
    });
    const result = await reorderArtistImagesAction('a1', ['i1', 'i2']);
    expect(result.success).toBe(true);
    expect(reorderArtistImagesMock).toHaveBeenCalledWith('a1', ['i1', 'i2']);
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/artists');
  });
});
