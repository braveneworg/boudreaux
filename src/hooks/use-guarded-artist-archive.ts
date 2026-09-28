/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useCallback } from 'react';

import { useArchiveArtistMutation } from '@/hooks/mutations/use-artist-mutations';
import { useHidingWarning, type UseHidingWarning } from '@/hooks/use-hiding-warning';

/** The result of an archive the admin may have backed out of. */
export interface GuardedArchiveResult {
  success: boolean;
  error?: string;
  /** The admin cancelled at the warning; nothing was written. */
  cancelled?: boolean;
}

/** What {@link useGuardedArtistArchive} returns. */
export interface UseGuardedArtistArchive {
  /** Warn, then archive the artist unless the admin cancels. */
  archiveArtist: (artistId: string) => Promise<GuardedArchiveResult>;
  /** Props for the `HidingWarningDialog` the caller renders. */
  warning: Pick<UseHidingWarning, 'work'> & { onConfirm: () => void; onCancel: () => void };
}

/**
 * Archives an artist after showing the admin the public work that will lose
 * the artist's name (ADR-0015). Shared by the artists list and the artist
 * form so both warn the same way.
 */
export const useGuardedArtistArchive = (): UseGuardedArtistArchive => {
  const { archiveArtistAsync } = useArchiveArtistMutation();
  const { confirmHiding, work, confirm, cancel } = useHidingWarning();

  const archiveArtist = useCallback(
    async (artistId: string): Promise<GuardedArchiveResult> => {
      if (!(await confirmHiding(artistId))) {
        return { success: false, cancelled: true };
      }
      return archiveArtistAsync({ artistId });
    },
    [confirmHiding, archiveArtistAsync]
  );

  return { archiveArtist, warning: { work, onConfirm: confirm, onCancel: cancel } };
};
