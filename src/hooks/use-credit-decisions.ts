/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useCallback, useRef, useState } from 'react';

import {
  useCreditConfirmationLoader,
  type CreditConfirmationSource,
} from '@/hooks/queries/use-credit-confirmation-loader';
import {
  NO_CREDIT_DECISIONS,
  type CreditConfirmation,
  type CreditDecisions,
} from '@/lib/utils/credit-confirmation';

type Settle = (decisions: CreditDecisions | null) => void;

/** What {@link useCreditDecisions} returns. */
export interface UseCreditDecisions {
  /**
   * Load the credits and, when the admin has something to decide or to be
   * told, ask. Resolves with the decisions, or `null` when the admin cancels.
   * Rejects when the credits cannot be loaded.
   */
  requestDecisions: (source: CreditConfirmationSource) => Promise<CreditDecisions | null>;
  /** The credits being asked about; `null` while no question is open. */
  confirmation: CreditConfirmation | null;
  /** Answer the open question with the admin's decisions. */
  confirm: (decisions: CreditDecisions) => void;
  /** Close the open question without publishing anything. */
  cancel: () => void;
}

const hasSomethingToShow = ({ awaiting, stayHidden }: CreditConfirmation): boolean =>
  awaiting.length > 0 || stayHidden.length > 0;

/**
 * The state behind a `CreditConfirmationDialog`: turns "publish this release"
 * into a question the admin answers, as a promise the caller can await before
 * it writes (ADR-0015). Pass `confirmation`, `confirm` and `cancel` to the
 * dialog.
 *
 * Nothing is asked when no credit awaits confirmation and none stays hidden:
 * the promise resolves at once with no decisions.
 */
export const useCreditDecisions = (): UseCreditDecisions => {
  const load = useCreditConfirmationLoader();
  const [confirmation, setConfirmation] = useState<CreditConfirmation | null>(null);
  const settleRef = useRef<Settle | null>(null);

  const settle = useCallback((decisions: CreditDecisions | null) => {
    settleRef.current?.(decisions);
    settleRef.current = null;
    setConfirmation(null);
  }, []);

  const requestDecisions = useCallback(
    async (source: CreditConfirmationSource): Promise<CreditDecisions | null> => {
      const loaded = await load(source);
      if (!hasSomethingToShow(loaded)) {
        return NO_CREDIT_DECISIONS;
      }
      // A question still open is answered as cancelled before the next is asked.
      settleRef.current?.(null);
      return new Promise<CreditDecisions | null>((resolve) => {
        settleRef.current = resolve;
        setConfirmation(loaded);
      });
    },
    [load]
  );

  const cancel = useCallback(() => settle(null), [settle]);

  return { requestDecisions, confirmation, confirm: settle, cancel };
};
