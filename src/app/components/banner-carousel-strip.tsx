/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { type CSSProperties } from 'react';

import { cn } from '@/lib/utils';
import { isDarkColor } from '@/lib/utils/color';

import type { BannerSlotData } from './banner-carousel';

/** The non-null shape of a banner's notification. */
type BannerNotification = NonNullable<BannerSlotData['notification']>;

interface StripLayerProps {
  notification: BannerNotification;
  /** Pre-sanitized HTML for {@link notification} (memoized by the carousel). */
  html: string | null;
  /** Extra positioning utilities (the outgoing layer is absolutely placed). */
  className?: string;
  /** CSS `animation` shorthand, or `undefined` for the static strip. */
  animation?: string;
}

/** One notification layer — applies the author's colors, link styling, and HTML. */
const StripLayer = ({ notification, html, className, animation }: StripLayerProps) => (
  <div
    className={cn(
      'banner-strip-slide w-full px-4 py-2 text-center text-sm',
      isDarkColor(notification.backgroundColor) ? 'banner-strip-dark' : 'banner-strip-light',
      className
    )}
    style={{
      color: notification.textColor ?? undefined,
      backgroundColor: notification.backgroundColor ?? 'transparent',
      animation,
    }}
    dangerouslySetInnerHTML={{ __html: html ?? '' }}
  />
);

interface BannerCarouselStripProps {
  /** The notification on screen (the incoming one during a transition). */
  active: BannerNotification | null;
  /** The notification sliding out — only rendered while `isTransitioning`. */
  outgoing: BannerNotification | null;
  /** Pre-sanitized HTML for {@link active} (memoized by the carousel). */
  activeHtml: string | null;
  /** Pre-sanitized HTML for {@link outgoing}. */
  outgoingHtml: string | null;
  /** True while a swap is animating (drives the slide in/out keyframes). */
  isTransitioning: boolean;
  /** Opacity gate — the strip fades out when false (no notification / tab hidden). */
  visible: boolean;
  /** Slide duration in ms; kept in sync with the caller's banner transition. */
  transitionDurationMs: number;
  /** CSS timing function shared with the caller's transition. */
  easing: string;
  /** React key for the incoming strip — changing it remounts to restart the slide-in. */
  activeKey: string;
  /** React key for the outgoing strip. */
  outgoingKey: string;
}

/**
 * Notification strip for the mobile {@link BannerCarousel}. Renders the
 * (already sanitized) notification HTML and runs the seamless slide: the
 * outgoing strip exits to the right while the incoming one slides in from the
 * left. Always reserves 2.5rem so toggling a notification never shifts layout.
 *
 * Takes pre-sanitized HTML rather than raw content so the carousel can sanitize
 * once per banners payload instead of on every rotation tick.
 */
export const BannerCarouselStrip = ({
  active,
  outgoing,
  activeHtml,
  outgoingHtml,
  isTransitioning,
  visible,
  transitionDurationMs,
  easing,
  activeKey,
  outgoingKey,
}: BannerCarouselStripProps) => {
  const containerStyle: CSSProperties = {
    minHeight: '2.5rem',
    opacity: visible ? 1 : 0,
    transition: `opacity 300ms ${easing}`,
  };
  const activeAnimation = isTransitioning
    ? `banner-strip-slide-right ${transitionDurationMs}ms ${easing}`
    : undefined;

  return (
    <div className="relative w-full overflow-hidden" style={containerStyle}>
      {isTransitioning && outgoing && (
        <StripLayer
          key={outgoingKey}
          notification={outgoing}
          html={outgoingHtml}
          className="absolute inset-0"
          animation={`banner-strip-exit-right ${transitionDurationMs}ms ${easing} forwards`}
        />
      )}
      {active && (
        <StripLayer
          key={activeKey}
          notification={active}
          html={activeHtml}
          animation={activeAnimation}
        />
      )}
    </div>
  );
};
