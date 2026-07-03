/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useSearchParams } from 'next/navigation';

import { useSession } from '@/hooks/use-session';
import { disconnectPusherClient } from '@/lib/utils/pusher-client';

import { ChatAuthGate } from './chat-auth-gate';
import { ChatBody } from './chat-body';
import { ChatDrawer } from './chat-drawer';
import { ChatTriggerButton } from './chat-trigger-button';
import { useChatOpen } from './use-chat-open';

/**
 * Top-level chat entry point — mounted globally in the root layout.
 * Renders the floating trigger for everyone and gates the drawer body
 * behind authentication so anonymous visitors land on a sign-in CTA.
 */
export const ChatLauncher = () => {
  const { open, setOpen } = useChatOpen();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  // Mention emails link to `/?chat=mention`. When that param is present
  // and the user is authenticated, auto-open the drawer; ChatBody scrolls
  // to the most recent mention of the viewer once messages have loaded.
  const shouldAutoOpenForMention = searchParams.get('chat') === 'mention';

  const handleOpen = useCallback(() => setOpen(true), [setOpen]);
  const handleClose = useCallback(() => setOpen(false), [setOpen]);
  const isAuthenticated = status === 'authenticated' && Boolean(session);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (shouldAutoOpenForMention && isAuthenticated) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [shouldAutoOpenForMention, isAuthenticated, setOpen]);

  // Tear down the Pusher socket on sign-out so the now-stale userId no
  // longer holds a presence membership in the chat channel. Without
  // this, signing out without a hard refresh leaks a slot from the
  // free-tier concurrent-connection quota and keeps the (former) user
  // receiving peer broadcasts.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      disconnectPusherClient();
      setOpen(false);
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, setOpen]);

  return (
    <>
      {/* Pages that dock a trigger inside their ZinePanel mark it with
          data-chat-panel-trigger; this CSS :has() variant hides the global
          fixed stamp there without client state or a hydration flash. */}
      <ChatTriggerButton
        onOpen={handleOpen}
        className="[body:has([data-chat-panel-trigger])_&]:hidden"
      />
      <ChatDrawer open={open} onOpenChange={setOpen}>
        {isAuthenticated && session ? (
          <ChatBody session={session} enabled={open} scrollToMention={shouldAutoOpenForMention} />
        ) : (
          <ChatAuthGate onSignIn={handleClose} />
        )}
      </ChatDrawer>
    </>
  );
};
