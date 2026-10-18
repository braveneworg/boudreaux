/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const findAllByUserMock = vi.fn();
const deleteByIdMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findAllByUser: findAllByUserMock,
    deleteById: deleteByIdMock,
  },
}));

const { getCollectionAction, deletePurchaseAction } = await import('./collection-actions');

const passAs = (user: Record<string, string>) => ({ success: true, session: { user } });

describe('getCollectionAction', () => {
  beforeEach(() => {
    gateActionMock.mockReset();
    findAllByUserMock.mockReset();
  });

  it('returns the gate refusal with an empty collection, without reading purchases', async () => {
    gateActionMock.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
    });
    const result = await getCollectionAction();
    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
      data: [],
    });
    expect(findAllByUserMock).not.toHaveBeenCalled();
  });

  it('returns purchases for the authenticated user', async () => {
    gateActionMock.mockResolvedValue(passAs({ id: 'u1' }));
    const artist = { id: 'a1', publishedOn: new Date('2024-01-01'), deletedOn: null };
    const purchases = [
      { id: 'p1', release: { artistReleases: [{ artist }] } },
      { id: 'p2', release: { artistReleases: [] } },
    ];
    findAllByUserMock.mockResolvedValue(purchases);
    const result = await getCollectionAction();
    expect(result).toEqual({
      success: true,
      data: [
        { id: 'p1', release: { artistReleases: [{ artist }], albumArtist: artist } },
        { id: 'p2', release: { artistReleases: [], albumArtist: null } },
      ],
    });
    expect(findAllByUserMock).toHaveBeenCalledWith('u1');
  });

  it('returns failure when the repository throws', async () => {
    gateActionMock.mockResolvedValue(passAs({ id: 'u1' }));
    findAllByUserMock.mockRejectedValue(new Error('db down'));
    const result = await getCollectionAction();
    expect(result).toEqual({ success: false, error: 'Failed to load collection', data: [] });
  });
});

describe('deletePurchaseAction', () => {
  beforeEach(() => {
    gateActionMock.mockReset();
    deleteByIdMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it('returns the gate refusal without deleting the purchase', async () => {
    const refusal = { success: false, error: 'Unauthorized', code: 'FORBIDDEN' };
    gateActionMock.mockResolvedValue(refusal);
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual(refusal);
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });

  it('deletes a purchase for admin and revalidates the path', async () => {
    gateActionMock.mockResolvedValue(passAs({ id: 'admin', role: 'admin' }));
    deleteByIdMock.mockResolvedValue(undefined);
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: true });
    expect(deleteByIdMock).toHaveBeenCalledWith('p1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/collection');
  });

  it('returns failure when the repository throws', async () => {
    gateActionMock.mockResolvedValue(passAs({ id: 'admin', role: 'admin' }));
    deleteByIdMock.mockRejectedValue(new Error('db error'));
    const result = await deletePurchaseAction('p1');
    expect(result).toEqual({ success: false, error: 'Failed to delete purchase' });
  });
});
