/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';
import { isDarkColor } from '@/lib/utils/color';
import {
  addLinkAttributes,
  sanitizeNotificationHtml,
} from '@/lib/validation/banner-notification-schema';

/** A single banner notification (the non-null shape of `BannerSlotData.notification`). */
export interface BannerNotification {
  id: string;
  content: string;
  textColor: string | null;
  backgroundColor: string | null;
}

export type BannerNotificationSize = 'default' | 'lg';

/**
 * Per-size body spacing/typography + reserved height. `lg` (desktop) is a
 * little taller with a larger font; `default` matches the mobile carousel.
 */
const SIZE_STYLES = new Map<BannerNotificationSize, { minHeight: string; body: string }>([
  ['default', { minHeight: '2.5rem', body: 'px-4 py-2 text-sm' }],
  ['lg', { minHeight: '3.25rem', body: 'px-6 py-3 text-base' }],
]);

const DEFAULT_SIZE_STYLE = { minHeight: '2.5rem', body: 'px-4 py-2 text-sm' };

interface BannerNotificationStripProps {
  /** The notification on screen (the incoming one during a transition). */
  active: BannerNotification | null;
  /** The notification sliding out — only rendered while `isTransitioning`. */
  outgoing: BannerNotification | null;
  /** True while a swap is animating (drives the slide in/out keyframes). */
  isTransitioning: boolean;
  /** Opacity gate — the strip fades out when false (no notification / tab hidden). */
  visible: boolean;
  /** Slide duration in ms; the caller keeps this in sync with its own transition. */
  transitionDurationMs: number;
  /** CSS timing function shared with the caller's transition. */
  easing: string;
  /**
   * React keys for the incoming/outgoing strips. Changing `activeKey` on each
   * swap remounts the element so the CSS slide-in animation restarts.
   */
  activeKey: string;
  outgoingKey: string;
  /** Visual size — `lg` is taller with a larger font (desktop). Defaults to `default`. */
  size?: BannerNotificationSize;
}

/**
 * Presentational notification strip shared by the mobile {@link BannerCarousel}
 * and the desktop {@link BannerNotificationTicker}. Renders the sanitized
 * notification content, applies the author's colors + dark/light link styling,
 * and runs the seamless left-to-right slide: the outgoing notification exits to
 * the right while the incoming one slides in from the left. Always reserves
 * `minHeight` so toggling a notification on/off never shifts layout.
 */
export const BannerNotificationStrip = ({
  active,
  outgoing,
  isTransitioning,
  visible,
  transitionDurationMs,
  easing,
  activeKey,
  outgoingKey,
  size = 'default',
}: BannerNotificationStripProps) => {
  const { minHeight, body } = SIZE_STYLES.get(size) ?? DEFAULT_SIZE_STYLE;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        minHeight,
        opacity: visible ? 1 : 0,
        transition: `opacity 300ms ${easing}`,
      }}
    >
      {/* Outgoing strip — slides out to the right during transitions */}
      {isTransitioning && outgoing && (
        <div
          key={outgoingKey}
          className={cn(
            'banner-strip-slide absolute inset-0 w-full text-center',
            body,
            isDarkColor(outgoing.backgroundColor) ? 'banner-strip-dark' : 'banner-strip-light'
          )}
          style={{
            color: outgoing.textColor ?? undefined,
            backgroundColor: outgoing.backgroundColor ?? 'transparent',
            animation: `banner-strip-exit-right ${transitionDurationMs}ms ${easing} forwards`,
          }}
          dangerouslySetInnerHTML={{
            __html: addLinkAttributes(sanitizeNotificationHtml(outgoing.content)),
          }}
        />
      )}
      {/* Incoming strip — slides in from the left; static when not transitioning */}
      {active && (
        <div
          key={activeKey}
          className={cn(
            'banner-strip-slide w-full text-center',
            body,
            isDarkColor(active.backgroundColor) ? 'banner-strip-dark' : 'banner-strip-light'
          )}
          style={{
            color: active.textColor ?? undefined,
            backgroundColor: active.backgroundColor ?? 'transparent',
            ...(isTransitioning
              ? { animation: `banner-strip-slide-right ${transitionDurationMs}ms ${easing}` }
              : {}),
          }}
          dangerouslySetInnerHTML={{
            __html: addLinkAttributes(sanitizeNotificationHtml(active.content)),
          }}
        />
      )}
    </div>
  );
};
