/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef } from 'react';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { useSession } from '@/hooks/use-session';

import { ChatAuthGate } from './chat-auth-gate';
import { ChatBodyLoading } from './chat-body-loading';
import { ChatDrawer } from './chat-drawer';
import { ChatTriggerButton } from './chat-trigger-button';
import { useChatOpen } from './use-chat-open';

// The chat body (message list, composer, Pusher socket, fingerprinting,
// emoji, mention parsing) is the heaviest client subtree the root layout
// mounts, and nothing on a page needs it until the drawer opens. Loading it
// on first open keeps pusher-js and friends out of every page's initial
// bundle. `ssr: false` because the drawer content only mounts client-side on
// open anyway, and it gives the lazy chunk its own Suspense boundary so the
// in-flight state is the drawer's spinner, never the route's loading skeleton.
const ChatBody = dynamic(() => import('./chat-body').then((mod) => mod.ChatBody), {
  ssr: false,
  loading: () => <ChatBodyLoading label="Loading chat" />,
});

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

  // Only a mounted chat body ever opens the Pusher socket, so remember whether
  // one ran: a sign-out that never saw the drawer has nothing to disconnect,
  // and importing the client just to find that out would pull the pusher-js
  // chunk into the page.
  const chatSessionRanRef = useRef(false);
  if (open && isAuthenticated) {
    chatSessionRanRef.current = true;
  }

  // Tear down the Pusher socket on sign-out so the now-stale userId no
  // longer holds a presence membership in the chat channel. Without
  // this, signing out without a hard refresh leaks a slot from the
  // free-tier concurrent-connection quota and keeps the (former) user
  // receiving peer broadcasts.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      if (chatSessionRanRef.current) {
        void import('@/lib/utils/pusher-client').then(({ disconnectPusherClient }) =>
          disconnectPusherClient()
        );
      }
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
