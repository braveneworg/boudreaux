// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { toast } from 'sonner';

import { STALE_PAGE_MESSAGE } from '@/lib/utils/stale-server-action';

import { notifyIfStaleServerAction, showStalePageToast } from './stale-page-toast';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const staleError = (): Error => {
  const error = new Error('Server Action "abc" was not found on the server.');
  error.name = 'UnrecognizedActionError';
  return error;
};

const lastToastOptions = (): { id?: string; action?: { label: string; onClick: () => void } } =>
  vi.mocked(toast.error).mock.calls.at(-1)?.[1] as never;

beforeEach(() => {
  vi.mocked(toast.error).mockReset();
});

describe('showStalePageToast', () => {
  it('shows one deduplicated error toast with the stale-page message', () => {
    showStalePageToast();
    showStalePageToast();

    expect(vi.mocked(toast.error).mock.calls.map(([message]) => message)).toEqual([
      STALE_PAGE_MESSAGE,
      STALE_PAGE_MESSAGE,
    ]);
    expect(lastToastOptions().id).toBe('stale-page');
  });

  it('offers a Reload action that reloads the page', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    showStalePageToast();
    lastToastOptions().action?.onClick();

    expect(lastToastOptions().action?.label).toBe('Reload');
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('notifyIfStaleServerAction', () => {
  it('shows the toast and returns true for a stale server action error', () => {
    expect(notifyIfStaleServerAction(staleError())).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('stays silent and returns false for any other error', () => {
    expect(notifyIfStaleServerAction(new Error('db down'))).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
