/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { ChatTriggerButton } from './chat-trigger-button';
import { useChatOpen } from './use-chat-open';

/**
 * Chat trigger docked inside a page's ZinePanel. Sticky, so it floats at
 * the viewport bottom exactly like the global fixed stamp while the panel
 * is in view, then parks at the panel's bottom edge instead of hovering
 * over the footer. The `data-chat-panel-trigger` marker lets the global
 * fixed trigger hide itself via CSS `:has()` whenever a docked trigger is
 * on the page — no client state or hydration flash involved.
 */
export const ChatPanelTrigger = (): React.ReactElement => {
  const { setOpen } = useChatOpen();
  const handleOpen = useCallback(() => setOpen(true), [setOpen]);

  return (
    <div
      data-chat-panel-trigger=""
      // pointer-events gate: while stuck, the full-width row overlays
      // content beneath it — only the button itself should catch clicks.
      className="pointer-events-none sticky bottom-6 z-30 mt-6 flex justify-end"
    >
      <ChatTriggerButton
        onOpen={handleOpen}
        className="pointer-events-auto static right-auto bottom-auto z-auto"
      />
    </div>
  );
};
