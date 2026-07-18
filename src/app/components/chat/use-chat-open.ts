/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { create } from 'zustand';

interface ChatOpenState {
  /** Whether the chat drawer is open. */
  open: boolean;
  /** Open/close the chat drawer. */
  setOpen: (open: boolean) => void;
}

/**
 * Shares the chat drawer's open state between the globally-mounted
 * {@link ChatLauncher} (which owns the drawer) and any docked triggers
 * rendered inside page content (e.g. the ZinePanel chat dock).
 *
 * Zustand store — no provider required. Calling `useChatOpen()` returns
 * `{ open, setOpen }` exactly as the previous Context hook did, and
 * `setOpen` is identity-stable across renders. Browser-write-only: nothing
 * calls `setOpen` during SSR, so the server always renders the drawer
 * closed and module-level state cannot leak across requests.
 */
export const useChatOpen = create<ChatOpenState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
