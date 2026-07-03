/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_ROTATION_INTERVAL } from '@/lib/constants/banner-slots';

import { BannerNotificationStrip, type BannerNotification } from './banner-notification-strip';

import type { BannerSlotData } from './banner-carousel';

// Mirror the carousel's slide timing so the desktop strip animates identically.
const TRANSITION_DURATION = 400; // ms — matches the CSS keyframe duration
const EASING = 'cubic-bezier(0.42, 0, 0.58, 1)'; // ease-in-out

interface BannerNotificationTickerProps {
  banners: BannerSlotData[];
  /** Seconds each notification is shown before sliding to the next. */
  rotationInterval?: number;
}

/**
 * Desktop notification ticker shown above the stitched {@link BannerStrip}.
 *
 * Unlike the mobile carousel — where the notification swaps in lockstep with a
 * banner slide — the desktop banners are static, so this drives its own timer
 * and rotates through every banner notification on an interval. Each cycle the
 * incoming notification slides in from the left while the outgoing one exits to
 * the right (the same seamless motion the carousel uses). Auto-rotation pauses
 * while the tab is hidden, matching the carousel.
 */
export const BannerNotificationTicker = ({
  banners,
  rotationInterval = DEFAULT_ROTATION_INTERVAL,
}: BannerNotificationTickerProps) => {
  const notifications = useMemo<BannerNotification[]>(
    () => banners.map((banner) => banner.notification).filter((n) => n !== null),
    [banners]
  );

  const total = notifications.length;
  const [index, setIndex] = useState(0);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const indexRef = useRef(0);

  // Auto-rotation timer. Each tick stages the next notification as "incoming"
  // (running the crossfade) and commits it once the slide animation finishes.
  useEffect(() => {
    if (total <= 1 || !isTabVisible) return;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const rotateTimer = setInterval(() => {
      const next = (indexRef.current + 1) % total;
      setIncomingIndex(next);
      settleTimer = setTimeout(() => {
        indexRef.current = next;
        setIndex(next);
        setIncomingIndex(null);
      }, TRANSITION_DURATION);
    }, rotationInterval * 1000);

    return () => {
      clearInterval(rotateTimer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [total, isTabVisible, rotationInterval]);

  // Pause rotation when the tab is in the background (parity with the carousel).
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  if (total === 0) return null;

  const isTransitioning = incomingIndex !== null;
  const outgoing = notifications.at(index) ?? null;
  const active = incomingIndex !== null ? (notifications.at(incomingIndex) ?? null) : outgoing;
  const visible = active !== null && isTabVisible;

  return (
    <BannerNotificationStrip
      size="lg"
      active={active}
      outgoing={outgoing}
      isTransitioning={isTransitioning}
      visible={visible}
      transitionDurationMs={TRANSITION_DURATION}
      easing={EASING}
      activeKey={isTransitioning ? `in-${incomingIndex}` : `${index}`}
      outgoingKey={`out-${index}`}
    />
  );
};
