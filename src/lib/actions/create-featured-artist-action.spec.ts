/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const createFeaturedArtistMock = vi.fn();
const revalidatePathMock = vi.fn();
const logSecurityEventMock = vi.fn();
const deleteByPrefixMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/utils/simple-cache', () => ({ cache: { deleteByPrefix: deleteByPrefixMock } }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

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
    gateActionMock.mockReset();
    createFeaturedArtistMock.mockReset();
    revalidatePathMock.mockReset();
    logSecurityEventMock.mockReset();
    deleteByPrefixMock.mockReset();
  });

  it('resolves the gate refusal as a form error without creating the featured artist', async () => {
    gateActionMock.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });

    const result = await createFeaturedArtistAction(initialFormState, buildFormData({}));

    expect(result).toEqual({ fields: {}, success: false, errors: { general: ['Unauthorized'] } });
    expect(createFeaturedArtistMock).not.toHaveBeenCalled();
  });

  it('returns validation errors when required fields are missing', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
    const result = await createFeaturedArtistAction(
      initialFormState,
      buildFormData({ position: '-1' })
    );
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('creates a featured artist with valid input', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
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
    expect(deleteByPrefixMock).toHaveBeenCalledWith('featured-artists:');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });

  it('surfaces service errors as form errors', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
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
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
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
    gateActionMock.mockResolvedValue({ success: true, session: adminSession });
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
