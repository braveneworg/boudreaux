/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useRef } from 'react';

import { toast } from 'sonner';

import { useCreditDecisions } from '@/hooks/use-credit-decisions';
import type { CreditConfirmation, CreditDecisions } from '@/lib/utils/credit-confirmation';

interface UseReleaseCreditGateOptions {
  /** Whether the release was already published before this save. */
  isPublished: boolean;
  /** Take back the publication date the publish button put on the form. */
  clearPublishedAt: () => void;
}

/** The form values the gate reads. */
interface GatedReleaseValues {
  publishedAt?: string;
  artistIds?: string[];
}

/** What {@link useReleaseCreditGate} returns. */
export interface UseReleaseCreditGate {
  /**
   * Run before the form submits. Resolves `true` when the save may go ahead,
   * `false` when the admin cancelled or the credits could not be loaded.
   */
  resolve: (values: GatedReleaseValues) => Promise<boolean>;
  /** The decisions of the save that was let through, to send with it. */
  getDecisions: () => CreditDecisions | undefined;
  /** Props for the form's `CreditConfirmationDialog`. */
  dialog: {
    confirmation: CreditConfirmation | null;
    /** "Publish release", or "Save release" when it is already published. */
    confirmLabel: string;
    onConfirm: (decisions: CreditDecisions) => void;
    onCancel: () => void;
  };
}

const FALLBACK_ERROR = 'Failed to load the credited artists';

/**
 * Holds a publishing save of the release form until the admin has decided
 * each credited artist (ADR-0015). A save that leaves the release unpublished
 * goes straight through.
 *
 * The form names the artists it will credit, so the question is asked about
 * those rather than the stored credits: they are not stored until the save.
 *
 * When the admin backs out of publishing a release that was not published,
 * the publication date the publish button set is taken back, so a later plain
 * save does not publish by accident.
 */
export const useReleaseCreditGate = ({
  isPublished,
  clearPublishedAt,
}: UseReleaseCreditGateOptions): UseReleaseCreditGate => {
  const { requestDecisions, confirmation, confirm, cancel } = useCreditDecisions();
  const decisionsRef = useRef<CreditDecisions | undefined>(undefined);

  const stop = useCallback((): boolean => {
    if (!isPublished) {
      clearPublishedAt();
    }
    return false;
  }, [isPublished, clearPublishedAt]);

  const resolve = useCallback(
    async ({ publishedAt, artistIds = [] }: GatedReleaseValues): Promise<boolean> => {
      decisionsRef.current = undefined;
      if (!publishedAt) {
        return true;
      }

      try {
        const decisions = await requestDecisions({ artistIds });
        if (!decisions) {
          return stop();
        }
        decisionsRef.current = decisions;
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : FALLBACK_ERROR);
        return stop();
      }
    },
    [requestDecisions, stop]
  );

  const getDecisions = useCallback(() => decisionsRef.current, []);

  const dialog = useMemo(
    () => ({
      confirmation,
      confirmLabel: isPublished ? 'Save release' : 'Publish release',
      onConfirm: confirm,
      onCancel: cancel,
    }),
    [confirmation, isPublished, confirm, cancel]
  );

  return { resolve, getDecisions, dialog };
};
