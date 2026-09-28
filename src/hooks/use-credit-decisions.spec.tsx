/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';

import type { CreditConfirmation } from '@/lib/utils/credit-confirmation';

import { useCreditDecisions } from './use-credit-decisions';

const mockLoad = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/use-credit-confirmation-loader', () => ({
  useCreditConfirmationLoader: () => mockLoad,
}));

const abel = {
  id: 'a',
  slug: 'abel',
  name: 'Abel',
  bioState: 'none' as const,
  bioGeneratedAt: null,
  displayImageCount: 0,
};
const gone = { id: 'x', slug: 'gone', name: 'Gone', reason: 'deleted' as const };
const withAwaiting: CreditConfirmation = { awaiting: [abel], stayHidden: [] };
const decisions = { publishArtistIds: ['a'], keepHiddenArtistIds: [] };

describe('useCreditDecisions', () => {
  afterEach(() => {
    mockLoad.mockReset();
  });

  it('resolves with no decisions, without asking, when nothing needs one', async () => {
    mockLoad.mockResolvedValueOnce({ awaiting: [], stayHidden: [] });
    const { result } = renderHook(() => useCreditDecisions());

    const outcome = await act(() => result.current.requestDecisions({ releaseId: 'r' }));

    expect({ outcome, asking: result.current.confirmation }).toEqual({
      outcome: { publishArtistIds: [], keepHiddenArtistIds: [] },
      asking: null,
    });
  });

  it('loads the credits of the source it is given', async () => {
    mockLoad.mockResolvedValueOnce({ awaiting: [], stayHidden: [] });
    const { result } = renderHook(() => useCreditDecisions());

    await act(() => result.current.requestDecisions({ artistIds: ['a', 'b'] }));

    expect(mockLoad.mock.calls).toEqual([[{ artistIds: ['a', 'b'] }]]);
  });

  it('asks when a credit awaits confirmation', async () => {
    mockLoad.mockResolvedValueOnce(withAwaiting);
    const { result } = renderHook(() => useCreditDecisions());

    act(() => {
      void result.current.requestDecisions({ releaseId: 'r' });
    });

    await waitFor(() => expect(result.current.confirmation).toEqual(withAwaiting));
  });

  it('asks when a credit will not be shown, so the admin is told', async () => {
    const onlyHidden = { awaiting: [], stayHidden: [gone] };
    mockLoad.mockResolvedValueOnce(onlyHidden);
    const { result } = renderHook(() => useCreditDecisions());

    act(() => {
      void result.current.requestDecisions({ releaseId: 'r' });
    });

    await waitFor(() => expect(result.current.confirmation).toEqual(onlyHidden));
  });

  it("resolves with the admin's decisions once confirmed", async () => {
    mockLoad.mockResolvedValueOnce(withAwaiting);
    const { result } = renderHook(() => useCreditDecisions());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.requestDecisions({ releaseId: 'r' });
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());

    act(() => result.current.confirm(decisions));

    await expect(pending).resolves.toEqual(decisions);
  });

  it('resolves with null when the admin cancels', async () => {
    mockLoad.mockResolvedValueOnce(withAwaiting);
    const { result } = renderHook(() => useCreditDecisions());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.requestDecisions({ releaseId: 'r' });
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());

    act(() => result.current.cancel());

    await expect(pending).resolves.toBeNull();
  });

  it('closes once the admin has answered', async () => {
    mockLoad.mockResolvedValueOnce(withAwaiting);
    const { result } = renderHook(() => useCreditDecisions());
    act(() => {
      void result.current.requestDecisions({ releaseId: 'r' });
    });
    await waitFor(() => expect(result.current.confirmation).not.toBeNull());

    act(() => result.current.confirm(decisions));

    expect(result.current.confirmation).toBeNull();
  });

  it('rejects when the credits cannot be loaded', async () => {
    mockLoad.mockRejectedValueOnce(new Error('Failed to load the credited artists'));
    const { result } = renderHook(() => useCreditDecisions());

    await expect(act(() => result.current.requestDecisions({ releaseId: 'r' }))).rejects.toThrow(
      'Failed to load the credited artists'
    );
  });
});
