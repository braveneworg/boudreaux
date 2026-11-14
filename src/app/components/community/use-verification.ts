/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

/** The Turnstile round a form is on. */
export interface Verification {
  /** Whether the widget has passed this round. */
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  /** This round's token; empty until the widget passes. */
  token: string;
  handleToken: (token: string) => void;
  /** Changes with each round. Used as the widget's `key`, so a new round is a new widget. */
  round: number;
  /** End this round: the token has been sent, so the next send needs a new one. */
  spend: () => void;
}

/**
 * The Turnstile round a form is on: its token, and a key that remounts the
 * widget. A token is single use, so a form calls `spend` after every round
 * trip to the server and its submit stays locked until the widget passes
 * again.
 *
 * @returns The round's state and the handlers a `TurnstileWidget` takes.
 */
export const useVerification = (): Verification => {
  const [isVerified, setIsVerified] = useState(false);
  const [token, setToken] = useState('');
  const [round, setRound] = useState(0);
  const handleToken = useCallback((next: string): void => setToken(next), []);

  const spend = useCallback((): void => {
    setIsVerified(false);
    setToken('');
    setRound((current) => current + 1);
  }, []);

  return { isVerified, setIsVerified, token, handleToken, round, spend };
};
