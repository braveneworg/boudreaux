/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { formatTimeRemaining } from '@/lib/utils/format-time-remaining';

interface TimeRemainingProps {
  /** ISO-8601 timestamp at which the rolling cap window resets. */
  resetsAtIso: string;
  /** Optional override for the className applied to the wrapping `<time>` element. */
  className?: string;
  /** Identifier hook for the dialog's `aria-describedby` linkage. */
  id?: string;
}

/**
 * Live countdown rendered next to the disabled "Download limit reached"
 * button. Recomputes the human-readable label every 1 second via
 * `setInterval` (cleared on unmount). Uses `globalThis.setInterval` to
 * remain SSR-safe and to interoperate with `vi.useFakeTimers()` in tests.
 *
 * Feature: 007-free-digital-downloads (US2, T052).
 */
export const TimeRemaining = ({ resetsAtIso, className, id }: TimeRemainingProps) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const handle = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(handle);
  }, []);

  const targetMs = Date.parse(resetsAtIso);
  const delta = Number.isFinite(targetMs) ? targetMs - now : 0;
  const label = formatTimeRemaining(delta);

  return (
    <time
      id={id}
      dateTime={resetsAtIso}
      className={className}
      data-testid="time-remaining"
      role="timer"
      aria-live="polite"
    >
      {label}
    </time>
  );
};
