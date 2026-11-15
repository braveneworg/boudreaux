/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { createContext, useContext } from 'react';

/** An opener's handle on the submission modal its page hosts. */
export interface SubmissionModalControls {
  /**
   * Open a submission over the page the visitor is on. Call it in the click.
   *
   * @param opener - What the visitor clicked. Focus returns to it when the
   * submission closes; the surface has no trigger of its own to return to.
   */
  open: (submissionId: string, opener?: HTMLElement | null) => void;
  /** Close whatever is open; a no-op when nothing is. */
  close: () => void;
}

/**
 * The submission modal of the community section (ADR-0030), or `null` where
 * no page hosts one. `SubmissionModalProvider` is the one provider.
 */
export const SubmissionModalContext = createContext<SubmissionModalControls | null>(null);

/**
 * The submission modal the surrounding page hosts, for anything a visitor
 * clicks to open a submission.
 *
 * @returns Its controls, or `null` outside the community section: an opener
 * then falls back to the submission deep link.
 */
export const useSubmissionModal = (): SubmissionModalControls | null =>
  useContext(SubmissionModalContext);
