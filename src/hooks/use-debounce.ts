/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect, useState } from 'react';

/**
 * Debounces a value by the specified delay.
 * Returns the debounced value that only updates after `delay` ms of inactivity.
 *
 * `flushKey` bypasses the delay: whenever it changes between renders, the
 * current value is adopted in that same render. Pass a store-hydration flag
 * so a rehydrated value (e.g. a persisted search) reaches consumers before
 * anything fires on the stale debounced value.
 */
export const useDebounce = <T>(
  value: T,
  delay = 300,
  { flushKey }: { flushKey?: unknown } = {}
): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [lastFlushKey, setLastFlushKey] = useState<unknown>(flushKey);

  // Adjust-during-render, and ALSO return the adopted value from this same
  // render: setState here only affects the next pass, while hooks called
  // after this one in the flipping render would still see the stale value.
  const flushed = !Object.is(lastFlushKey, flushKey);
  if (flushed) {
    setLastFlushKey(flushKey);
    setDebouncedValue(value);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return flushed ? value : debouncedValue;
};
