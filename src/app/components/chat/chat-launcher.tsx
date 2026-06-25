/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { useSession } from '@/hooks/use-session';
import { disconnectPusherClient } from '@/lib/utils/pusher-client';

import { ChatAuthGate } from './chat-auth-gate';
import { ChatBody } from './chat-body';
import { ChatDrawer } from './chat-drawer';
import { ChatTriggerButton } from './chat-trigger-button';

/**
 * Top-level chat entry point — mounted globally in the root layout.
 * Renders the floating trigger for everyone and gates the drawer body
 * behind authentication so anonymous visitors land on a sign-in CTA.
 */
export const ChatLauncher = () => {
  const [open, setOpen] = useState(false);
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  // Mention emails link to `/?chat=mention`. When that param is present
  // and the user is authenticated, auto-open the drawer; ChatBody scrolls
  // to the most recent mention of the viewer once messages have loaded.
  const shouldAutoOpenForMention = searchParams.get('chat') === 'mention';

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const isAuthenticated = status === 'authenticated' && Boolean(session);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (shouldAutoOpenForMention && isAuthenticated) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [shouldAutoOpenForMention, isAuthenticated]);

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
  }, [isAuthenticated]);

  return (
    <>
      <ChatTriggerButton onOpen={handleOpen} />
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
