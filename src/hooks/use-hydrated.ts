/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => {};
const getSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * `false` during the server render and the hydrating render, `true` once the
 * component runs in the browser. Lets markup that only makes sense with
 * JavaScript (an `aria-haspopup` on a link that opens a dialog, a control
 * that needs a handler) appear after hydration without a mismatch, with no
 * effect and no state of its own.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
