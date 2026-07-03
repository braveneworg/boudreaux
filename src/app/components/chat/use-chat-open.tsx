/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

interface ChatOpenContextValue {
  /** Whether the chat drawer is open. */
  open: boolean;
  /** Open/close the chat drawer. */
  setOpen: (open: boolean) => void;
}

/**
 * Inert fallback for trees rendered without the provider (isolated page
 * tests, storybook-style harnesses). In the running app the provider is
 * always present via the root layout's Providers.
 */
const FALLBACK: ChatOpenContextValue = { open: false, setOpen: () => undefined };

const ChatOpenContext = React.createContext<ChatOpenContextValue | null>(null);

/**
 * Shares the chat drawer's open state between the globally-mounted
 * {@link ChatLauncher} (which owns the drawer) and any docked triggers
 * rendered inside page content (e.g. the ZinePanel chat dock).
 */
export const ChatOpenProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return <ChatOpenContext.Provider value={value}>{children}</ChatOpenContext.Provider>;
};

/**
 * Read and drive the shared chat drawer open state.
 *
 * @returns The `{ open, setOpen }` pair from the nearest provider, or an
 * inert closed state when rendered without one.
 */
export const useChatOpen = (): ChatOpenContextValue =>
  React.useContext(ChatOpenContext) ?? FALLBACK;
