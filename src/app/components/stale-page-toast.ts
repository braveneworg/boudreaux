/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { toast } from 'sonner';

import { isStaleServerActionError, STALE_PAGE_MESSAGE } from '@/lib/utils/stale-server-action';

/** One toast id so repeated failures in the same tab update it, never stack. */
const STALE_PAGE_TOAST_ID = 'stale-page';

/** Show the one "page is out of date" toast with a Reload action. */
export const showStalePageToast = (): void => {
  toast.error(STALE_PAGE_MESSAGE, {
    id: STALE_PAGE_TOAST_ID,
    duration: Infinity,
    action: { label: 'Reload', onClick: () => window.location.reload() },
  });
};

/**
 * If `error` is Next.js rejecting a Server Action id from an older build,
 * show the reload toast and return true so the caller can swap in
 * {@link STALE_PAGE_MESSAGE}; otherwise return false and stay silent.
 */
export const notifyIfStaleServerAction = (error: unknown): boolean => {
  if (!isStaleServerActionError(error)) return false;
  showStalePageToast();
  return true;
};
