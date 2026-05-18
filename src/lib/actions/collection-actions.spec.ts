/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const authMock = vi.fn();
const findAllByUserMock = vi.fn();
const deleteByIdMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/auth', () => ({ auth: authMock }));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findAllByUser: findAllByUserMock,
    deleteById: deleteByIdMock,
  },
}));

const { getCollectionAction, deletePurchaseAction } = await import('./collection-actions');

describe('getCollectionAction', () => {
  beforeEach(() => {
    authMock.mockReset();
    findAllByUserMock.mockReset();
  });

  it('returns auth error when session is missing', async () => {
    authMock.mockResolvedValue(null);
    const result = await getCollectionAction();
    expect(result).toEqual({ success: false, error: 'Authentication required', data: [] });
    expect(findAllByUserMock).not.toHaveBeenCalled();
  });

  it('returns purchases for the authenticated user', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const purchases = [{ id: 'p1' }, { id: 'p2' }];
    findAllByUserMock.mockResolvedValue(purchases);
    const result = await getCollectionAction();
    expect(result).toEqual({ success: true, data: purchases });
    expect(findAllByUserMock).toHaveBeenCalledWith('u1');
  });

  it('returns failure when the repository throws', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    findAllByUserMock.mockRejectedValue(new Error('db down'));
    const result = await getCollectionAction();
    expect(result).toEqual({ success: false, error: 'Failed to load collection', data: [] });
  });
});

describe('deletePurchaseAction', () => {
  beforeEach(() => {
    authMock.mockReset();
    deleteByIdMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('rejects unauthenticated callers', async () => {
    authMock.mockResolvedValue(null);
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: false, error: 'Authentication required' });
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: false, error: 'Insufficient permissions' });
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });

  it('deletes a purchase for admin and revalidates the path', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    deleteByIdMock.mockResolvedValue(undefined);
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: true });
    expect(deleteByIdMock).toHaveBeenCalledWith('p1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/collection');
  });

  it('returns failure when the repository throws', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    deleteByIdMock.mockRejectedValue(new Error('db error'));
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: false, error: 'Failed to delete purchase' });
  });
});
