/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  const result = twMerge(clsx(inputs));
  // Deduplicate identical classes while preserving order
  const classes = result.split(' ').filter(Boolean);
  const seen = new Set();
  const deduped = classes.filter((cls) => {
    if (seen.has(cls)) {
      return false;
    }
    seen.add(cls);
    return true;
  });
  return deduped.join(' ');
}
