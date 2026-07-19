/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConnectedAccounts } from './use-connected-accounts';

const listAccountsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: listAccountsMock,
  },
}));

const makeAccount = (providerId: string) => ({
  id: `id-${providerId}`,
  providerId,
  accountId: `acct-${providerId}`,
  userId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  scopes: [] as string[],
});

describe('useConnectedAccounts', () => {
  beforeEach(() => {
    listAccountsMock.mockReset();
  });

  it('starts in loading state with null accounts', () => {
    listAccountsMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConnectedAccounts());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.accounts).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('populates accounts after listAccounts resolves', async () => {
    const accounts = [makeAccount('google'), makeAccount('apple')];
    listAccountsMock.mockResolvedValue({ data: accounts, error: null });

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accounts).toEqual(accounts);
    expect(result.current.error).toBeNull();
  });

  it('sets error when listAccounts returns an error object', async () => {
    const authError = new Error('Auth failure');
    listAccountsMock.mockResolvedValue({ data: null, error: authError });

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accounts).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Auth failure');
  });

  it('converts a non-Error auth error to an Error', async () => {
    listAccountsMock.mockResolvedValue({ data: null, error: 'some string error' });

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('some string error');
  });

  it('sets error when listAccounts throws', async () => {
    listAccountsMock.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accounts).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
  });

  it('converts a thrown non-Error to an Error', async () => {
    listAccountsMock.mockRejectedValue('plain string throw');

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('plain string throw');
  });

  it('re-fetches accounts when refetch is called', async () => {
    const firstAccounts = [makeAccount('google')];
    const secondAccounts = [makeAccount('google'), makeAccount('facebook')];
    listAccountsMock.mockResolvedValueOnce({ data: firstAccounts, error: null });
    listAccountsMock.mockResolvedValueOnce({ data: secondAccounts, error: null });

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.accounts).toEqual(firstAccounts);

    await act(async () => {
      await result.current.refetch();
    });

    expect(listAccountsMock).toHaveBeenCalledTimes(2);
    expect(result.current.accounts).toEqual(secondAccounts);
  });

  it('sets loading true during refetch', async () => {
    listAccountsMock.mockResolvedValueOnce({ data: [], error: null });
    let resolveSecond: (value: unknown) => void = () => {};
    listAccountsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      })
    );

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      void result.current.refetch();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSecond({ data: [], error: null });
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets data to null when listAccounts returns null data with no error', async () => {
    listAccountsMock.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useConnectedAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accounts).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
