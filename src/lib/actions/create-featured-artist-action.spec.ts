/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const createFeaturedArtistMock = vi.fn();
const revalidatePathMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('../services/featured-artists-service', () => ({
  FeaturedArtistsService: { createFeaturedArtist: createFeaturedArtistMock },
}));

vi.mock('../utils/audit-log', () => ({ logSecurityEvent: logSecurityEventMock }));

const { createFeaturedArtistAction } = await import('./create-featured-artist-action');

const adminSession = { user: { id: 'admin-1', role: 'admin' } };
const VALID_OBJECT_ID = 'abcdef1234567890abcdef12';
const VALID_OBJECT_ID_2 = 'fedcba0987654321fedcba09';

const buildFormData = (fields: Record<string, string | string[]>): FormData => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
};

const initialFormState = {
  success: false,
  errors: {},
  fields: {},
};

describe('createFeaturedArtistAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    createFeaturedArtistMock.mockReset();
    revalidatePathMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it('throws when admin session lacks a user id', async () => {
    requireRoleMock.mockResolvedValue({ user: {} });
    await expect(createFeaturedArtistAction(initialFormState, buildFormData({}))).rejects.toThrow(
      'Session user id is required'
    );
  });

  it('returns validation errors when required fields are missing', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    const result = await createFeaturedArtistAction(
      initialFormState,
      buildFormData({ position: '-1' })
    );
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('creates a featured artist with valid input', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    createFeaturedArtistMock.mockResolvedValue({ success: true, data: { id: 'fa-1' } });

    const result = await createFeaturedArtistAction(
      initialFormState,
      buildFormData({
        displayName: 'Test Artist',
        position: '0',
        digitalFormatId: VALID_OBJECT_ID,
        releaseId: VALID_OBJECT_ID_2,
        artistIds: ['a1', 'a2'],
      })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ featuredArtistId: 'fa-1' });
    expect(createFeaturedArtistMock).toHaveBeenCalledTimes(1);
    const createArg = createFeaturedArtistMock.mock.calls[0][0];
    expect(createArg.artists.connect).toEqual([{ id: 'a1' }, { id: 'a2' }]);
    expect(logSecurityEventMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/featured-artists/new');
  });

  it('surfaces service errors as form errors', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    createFeaturedArtistMock.mockResolvedValue({ success: false, error: 'service failed' });

    const result = await createFeaturedArtistAction(
      initialFormState,
      buildFormData({
        position: '0',
        digitalFormatId: VALID_OBJECT_ID,
        releaseId: VALID_OBJECT_ID_2,
        artistIds: ['a1'],
      })
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({ general: ['service failed'] });
  });

  it('handles unexpected exceptions via setUnknownError', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    createFeaturedArtistMock.mockRejectedValue(new Error('boom'));

    const result = await createFeaturedArtistAction(
      initialFormState,
      buildFormData({
        position: '0',
        digitalFormatId: VALID_OBJECT_ID,
        releaseId: VALID_OBJECT_ID_2,
        artistIds: ['a1'],
      })
    );

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('connects digitalFormat and release when their ids are provided', async () => {
    requireRoleMock.mockResolvedValue(adminSession);
    createFeaturedArtistMock.mockResolvedValue({ success: true, data: { id: 'fa-1' } });

    await createFeaturedArtistAction(
      initialFormState,
      buildFormData({
        position: '0',
        artistIds: ['a1'],
        digitalFormatId: VALID_OBJECT_ID,
        releaseId: VALID_OBJECT_ID_2,
      })
    );

    const createArg = createFeaturedArtistMock.mock.calls[0][0];
    expect(createArg.digitalFormat).toEqual({ connect: { id: VALID_OBJECT_ID } });
    expect(createArg.release).toEqual({ connect: { id: VALID_OBJECT_ID_2 } });
  });
});
