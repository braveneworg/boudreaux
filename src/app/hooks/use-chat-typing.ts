/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TypingPayload } from './use-chat-channel';

const TYPING_TTL_MS = 3000;
const CLEANUP_INTERVAL_MS = 500;

export interface ActiveTyper {
  userId: string;
  username: string | null;
}

/**
 * Tracks who is currently typing. Each `noteTyping(payload)` call refreshes
 * a sliding 3-second TTL for that user. A short interval prunes entries
 * whose TTL has elapsed so the indicator naturally clears without needing
 * an explicit "stopped typing" event from the sender.
 */
export function useChatTyping(currentUserId: string | null) {
  // Map<userId, { username, expiresAt }>
  const [activeTypers, setActiveTypers] = useState<ActiveTyper[]>([]);
  const expiriesRef = useRef<Map<string, { username: string | null; expiresAt: number }>>(
    new Map()
  );

  const recomputeActive = useCallback(() => {
    const now = Date.now();
    let changed = false;
    for (const [userId, entry] of expiriesRef.current) {
      if (entry.expiresAt <= now) {
        expiriesRef.current.delete(userId);
        changed = true;
      }
    }
    if (changed) {
      setActiveTypers(
        Array.from(expiriesRef.current.entries()).map(([userId, entry]) => ({
          userId,
          username: entry.username,
        }))
      );
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(recomputeActive, CLEANUP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [recomputeActive]);

  const noteTyping = useCallback(
    (payload: TypingPayload) => {
      if (!payload.userId || payload.userId === currentUserId) return;
      expiriesRef.current.set(payload.userId, {
        username: payload.username,
        expiresAt: Date.now() + TYPING_TTL_MS,
      });
      setActiveTypers(
        Array.from(expiriesRef.current.entries()).map(([userId, entry]) => ({
          userId,
          username: entry.username,
        }))
      );
    },
    [currentUserId]
  );

  return { activeTypers, noteTyping };
}
