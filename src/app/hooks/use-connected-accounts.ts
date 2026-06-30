/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

/** A single social/OAuth account linked to the current user. */
export interface ConnectedAccount {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  scopes: string[];
}

/** Return value of {@link useConnectedAccounts}. */
export interface UseConnectedAccountsResult {
  /** Linked accounts, or null while loading / on error. */
  accounts: ConnectedAccount[] | null;
  /** True while the initial fetch or a refetch is in flight. */
  isLoading: boolean;
  /** Non-null when the last fetch failed. */
  error: Error | null;
  /** Manually re-fetch the accounts list (e.g. after a link/unlink action). */
  refetch: () => Promise<void>;
}

/**
 * Fetches the list of social accounts linked to the current user via
 * `authClient.listAccounts()`. Unlike `useSession`, this is a one-shot async
 * call, so we manage loading/error state manually and expose a `refetch`
 * callback so callers can re-sync after a link or unlink operation.
 */
export const useConnectedAccounts = (): UseConnectedAccountsResult => {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await authClient.listAccounts();
      if (authError !== null && authError !== undefined) {
        setError(authError instanceof Error ? authError : new Error(String(authError)));
        setAccounts(null);
      } else {
        setAccounts(data ?? null);
      }
    } catch (thrown: unknown) {
      setError(thrown instanceof Error ? thrown : new Error(String(thrown)));
      setAccounts(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, isLoading, error, refetch: fetchAccounts };
};
