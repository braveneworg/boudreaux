/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useCallback, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { PublishedWorkCreditedTo } from '@/lib/utils/credit-confirmation';
import { publishedWorkSchema } from '@/lib/validation/credit-confirmation-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** What {@link useHidingWarning} returns. */
export interface UseHidingWarning {
  /**
   * Run before an artist is archived or deleted. Resolves `true` when the
   * write may go ahead, `false` when the admin cancelled.
   */
  confirmHiding: (artistId: string) => Promise<boolean>;
  /** The public work being warned about; `null` while no warning is open. */
  work: PublishedWorkCreditedTo | null;
  /** Go ahead and hide the artist. */
  confirm: () => void;
  /** Keep the artist as it is. */
  cancel: () => void;
}

const carriesTheName = ({ releases, tourDates }: PublishedWorkCreditedTo): boolean =>
  releases.length > 0 || tourDates.length > 0;

/**
 * The state behind a `HidingWarningDialog`: before an artist is hidden, shows
 * the admin the public work that will lose the artist's name (ADR-0015).
 *
 * Hiding an artist always succeeds, so this warns and never blocks. With no
 * public work to list, or when the list cannot be loaded, the write goes
 * ahead: a takedown must not depend on a read.
 */
export const useHidingWarning = (): UseHidingWarning => {
  const queryClient = useQueryClient();
  const [work, setWork] = useState<PublishedWorkCreditedTo | null>(null);
  const settleRef = useRef<((proceed: boolean) => void) | null>(null);

  const settle = useCallback((proceed: boolean) => {
    settleRef.current?.(proceed);
    settleRef.current = null;
    setWork(null);
  }, []);

  const confirmHiding = useCallback(
    async (artistId: string): Promise<boolean> => {
      const loaded = await queryClient
        .fetchQuery({
          queryKey: queryKeys.artists.publishedWork(artistId),
          queryFn: ({ signal }) =>
            fetchAndParse(
              `/api/artists/${encodeURIComponent(artistId)}/published-work`,
              publishedWorkSchema,
              { signal, errorMessage: "Failed to load the artist's published work" }
            ),
          staleTime: 0,
        })
        .catch(() => null);
      if (!loaded || !carriesTheName(loaded)) {
        return true;
      }
      // A warning still open is answered as cancelled before the next is shown.
      settleRef.current?.(false);
      return new Promise<boolean>((resolve) => {
        settleRef.current = resolve;
        setWork(loaded);
      });
    },
    [queryClient]
  );

  const confirm = useCallback(() => settle(true), [settle]);
  const cancel = useCallback(() => settle(false), [settle]);

  return { confirmHiding, work, confirm, cancel };
};
