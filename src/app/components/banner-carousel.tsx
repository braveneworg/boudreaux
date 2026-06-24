/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { flushSync } from 'react-dom';

import {
  BANNER_ASPECT_PADDING,
  BANNER_CDN_PATH,
  DEFAULT_ROTATION_INTERVAL,
} from '@/lib/constants/banner-slots';
import {
  addLinkAttributes,
  sanitizeNotificationHtml,
} from '@/lib/validation/banner-notification-schema';

import { BannerCarouselDots } from './banner-carousel-dots';
import { BannerCarouselStrip } from './banner-carousel-strip';
import { BannerCarouselTrack } from './banner-carousel-track';
import { useBannerCarouselDrag } from './use-banner-carousel-drag';

export interface BannerSlotData {
  slotNumber: number;
  imageFilename: string;
  notification: {
    id: string;
    content: string;
    textColor: string | null;
    backgroundColor: string | null;
  } | null;
}

interface BannerCarouselProps {
  banners: BannerSlotData[];
  rotationInterval?: number;
}

/** Insert the `_w{width}` suffix before the file extension, matching S3 variant keys. */
export const buildBannerSrc = (filename: string, width?: number): string => {
  const base = `/${BANNER_CDN_PATH}/${filename}`;
  if (!width) return base;
  const lastDot = base.lastIndexOf('.');
  if (lastDot === -1) return `${base}_w${width}`;
  return `${base.substring(0, lastDot)}_w${width}${base.substring(lastDot)}`;
};

const TRANSITION_DURATION = 400; // ms — matches CSS transition
const EASING = 'cubic-bezier(0.42, 0, 0.58, 1)'; // ease-in-out

type BannerNotification = BannerSlotData['notification'];

interface StripContent {
  isTransitioning: boolean;
  outgoingNotification: BannerNotification;
  activeNotification: BannerNotification;
  stripVisible: boolean;
  outgoingHtml: string | null;
  activeHtml: string | null;
}

interface StripContentInput {
  banners: BannerSlotData[];
  sanitizedHtmlByIndex: Array<string | null>;
  currentIndex: number;
  incomingIndex: number | null;
  isTabVisible: boolean;
}

interface StripFrame<T> {
  outgoing: T | null;
  active: T | null;
}

/**
 * Pick the outgoing (current) and active values from an indexable source. During
 * a transition the active value is the incoming slide's; otherwise it stays the
 * current one — the same select used for both notifications and their HTML.
 */
const pickFrame = <T,>(
  source: Array<T | null>,
  currentIndex: number,
  incomingIndex: number | null
): StripFrame<T> => {
  const outgoing = source.at(currentIndex) ?? null;
  const active = incomingIndex === null ? outgoing : (source.at(incomingIndex) ?? null);
  return { outgoing, active };
};

/**
 * Derive the notification strip's content for the current frame: which strip is
 * showing (and which is sliding out), its pre-sanitized HTML, and whether the
 * strip should be visible. Kept at module scope so the component stays under the
 * cyclomatic-complexity ceiling. Mirrors the prior inline derivation exactly.
 */
const deriveStripContent = ({
  banners,
  sanitizedHtmlByIndex,
  currentIndex,
  incomingIndex,
  isTabVisible,
}: StripContentInput): StripContent => {
  const notifications = banners.map((banner) => banner.notification);
  const notification = pickFrame(notifications, currentIndex, incomingIndex);
  const html = pickFrame(sanitizedHtmlByIndex, currentIndex, incomingIndex);

  return {
    isTransitioning: incomingIndex !== null,
    outgoingNotification: notification.outgoing,
    activeNotification: notification.active,
    stripVisible: notification.active !== null && isTabVisible,
    outgoingHtml: html.outgoing,
    activeHtml: html.active,
  };
};

/**
 * BannerCarousel displays rotating banner images with optional notification
 * strips. Uses CSS transitions and pointer events — zero JS animation libraries.
 */
export const BannerCarousel = ({
  banners,
  rotationInterval = DEFAULT_ROTATION_INTERVAL,
}: BannerCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTabVisible, setIsTabVisible] = useState(true);
  // Whether the carousel is scrolled into the viewport. Starts `true` so SSR,
  // the no-op test IntersectionObserver, and browsers without the API keep the
  // existing always-rotating behavior; a real observer pauses rotation when the
  // carousel is offscreen (scrolled past on mobile, or `md:hidden` on desktop)
  // so the timer stops triggering re-renders no one can see.
  const [isInViewport, setIsInViewport] = useState(true);
  const [incomingIndex, setIncomingIndex] = useState<number | null>(null);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const totalSlides = banners.length;

  /** Run `fn` with the track element when it is mounted. */
  const withTrack = useCallback((fn: (track: HTMLDivElement) => void) => {
    const track = trackRef.current;
    /* v8 ignore next -- ref is always set after mount */
    if (track) fn(track);
  }, []);

  /** Current container width in px, falling back to `fallback` before layout. */
  const measureWidth = useCallback(
    /* v8 ignore next -- jsdom has no layout engine; offsetWidth is always 0 */
    (fallback: number) => containerRef.current?.offsetWidth ?? fallback,
    []
  );

  /** Clear the auto-rotation timer if one is running. */
  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  /** Apply a CSS transition to the track and move it */
  const animateTrack = useCallback(
    (targetX: number, onComplete: () => void) => {
      withTrack((track) => {
        track.style.transition = `transform ${TRANSITION_DURATION}ms ${EASING}`;
        track.style.transform = `translateX(${targetX}px)`;

        const handleEnd = () => {
          track.removeEventListener('transitionend', handleEnd);
          onComplete();
        };
        track.addEventListener('transitionend', handleEnd);
      });
    },
    [withTrack]
  );

  /** Reset track position instantly (no transition) */
  const resetTrack = useCallback(() => {
    withTrack((track) => {
      track.style.transition = 'none';
      track.style.transform = 'translateX(0px)';
    });
  }, [withTrack]);

  /** Finish a slide transition: update index and reset track position */
  const completeTransition = useCallback(
    (toIndex: number) => {
      flushSync(() => {
        currentIndexRef.current = toIndex;
        setCurrentIndex(toIndex);
        setIncomingIndex(null);
      });
      // React has synchronously committed new slide transforms — safe to snap track
      resetTrack();
      isAnimatingRef.current = false;
    },
    [resetTrack]
  );

  /** Animate the track to show a specific adjacent slide */
  const animateToSlide = useCallback(
    (toIndex: number, dir: number) => {
      if (isAnimatingRef.current || totalSlides <= 1) return;
      isAnimatingRef.current = true;
      setIncomingIndex(toIndex);
      const width = measureWidth(0);
      animateTrack(-dir * width, () => completeTransition(toIndex));
    },
    [totalSlides, measureWidth, animateTrack, completeTransition]
  );

  const goToNext = useCallback(() => {
    const next = (currentIndexRef.current + 1) % totalSlides;
    animateToSlide(next, 1);
  }, [totalSlides, animateToSlide]);

  const goToPrevious = useCallback(() => {
    const prev = (currentIndexRef.current - 1 + totalSlides) % totalSlides;
    animateToSlide(prev, -1);
  }, [totalSlides, animateToSlide]);

  /** Reset and restart the auto-rotation timer */
  const resetTimer = useCallback(() => {
    clearTimer();
    if (totalSlides <= 1) return;
    timerRef.current = setInterval(goToNext, rotationInterval * 1000);
  }, [clearTimer, goToNext, rotationInterval, totalSlides]);

  // Auto-rotation timer — only runs while the carousel is on screen.
  useEffect(() => {
    if (totalSlides <= 1 || !isInViewport) return;
    resetTimer();
    return () => clearTimer();
  }, [totalSlides, isInViewport, resetTimer, clearTimer]);

  // Pause rotation when the carousel scrolls out of the viewport so an
  // offscreen carousel doesn't keep re-rendering every `rotationInterval`.
  useEffect(() => {
    const el = containerRef.current;
    /* v8 ignore next -- guarded for SSR / browsers without IntersectionObserver */
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setIsInViewport(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tab visibility handling
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Sanitize each notification once per banners payload rather than on every
  // rotation tick — the regex chain is pure string work on unchanging input.
  // (Content is already sanitized server-side at the read boundary; this
  // client pass stays as defense-in-depth.)
  const sanitizedHtmlByIndex = useMemo(
    () =>
      banners.map((banner) =>
        banner.notification
          ? addLinkAttributes(sanitizeNotificationHtml(banner.notification.content))
          : null
      ),
    [banners]
  );

  // Derive outgoing and incoming notification strips for seamless crossfade.
  const {
    isTransitioning,
    outgoingNotification,
    activeNotification,
    stripVisible,
    outgoingHtml,
    activeHtml,
  } = deriveStripContent({
    banners,
    sanitizedHtmlByIndex,
    currentIndex,
    incomingIndex,
    isTabVisible,
  });

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
        resetTimer();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNext();
        resetTimer();
      }
    },
    [goToNext, goToPrevious, resetTimer]
  );

  const { handlePointerDown, handlePointerMove, handlePointerUp } = useBannerCarouselDrag({
    totalSlides,
    isAnimatingRef,
    currentIndexRef,
    measureWidth,
    withTrack,
    animateTrack,
    completeTransition,
    setIncomingIndex,
    resetTimer,
  });

  /** Navigate to a specific dot — animate if adjacent, instant jump otherwise */
  const goToIndex = useCallback(
    (idx: number) => {
      if (idx === currentIndexRef.current || isAnimatingRef.current) return;

      const prevIdx = (currentIndexRef.current - 1 + totalSlides) % totalSlides;
      const nextIdx = (currentIndexRef.current + 1) % totalSlides;

      if (idx === nextIdx) {
        animateToSlide(idx, 1);
      } else if (idx === prevIdx) {
        animateToSlide(idx, -1);
      } else {
        // Non-adjacent: instant jump
        currentIndexRef.current = idx;
        setCurrentIndex(idx);
        resetTrack();
      }
      resetTimer();
    },
    [totalSlides, animateToSlide, resetTrack, resetTimer]
  );

  if (banners.length === 0) {
    // Reserve the same vertical space as a loaded carousel to prevent CLS
    return (
      <section className="relative w-full md:hidden" aria-hidden="true">
        {/* Notification strip placeholder */}
        <div className="w-full" style={{ minHeight: '2.5rem' }} />
        {/* Banner aspect-ratio placeholder */}
        <div
          className="bg-muted relative w-full"
          style={{ paddingBottom: BANNER_ASPECT_PADDING }}
        />
        {/* Dot indicators placeholder */}
        <div className="flex justify-center gap-2 py-2">
          <div className="h-11 w-11" />
        </div>
      </section>
    );
  }

  const prevIndex = (currentIndex - 1 + totalSlides) % totalSlides;
  const nextIndex = (currentIndex + 1) % totalSlides;

  return (
    <section
      className="relative w-full overflow-hidden md:hidden"
      aria-label="Banner carousel"
      aria-roledescription="carousel"
      // Capture-phase keydown so arrow keys steer the carousel while focus rests on
      // its inner controls (the dot buttons below), without making the region landmark
      // itself a tab stop — mirrors the shadcn Carousel pattern in ui/carousel.tsx.
      onKeyDownCapture={handleKeyDown}
    >
      <BannerCarouselStrip
        active={activeNotification}
        outgoing={outgoingNotification}
        activeHtml={activeHtml}
        outgoingHtml={outgoingHtml}
        isTransitioning={isTransitioning}
        visible={stripVisible}
        transitionDurationMs={TRANSITION_DURATION}
        easing={EASING}
        activeKey={`strip-${isTransitioning ? `in-${incomingIndex}` : currentIndex}`}
        outgoingKey={`strip-out-${currentIndex}`}
      />

      <BannerCarouselTrack
        banners={banners}
        currentIndex={currentIndex}
        prevIndex={prevIndex}
        nextIndex={nextIndex}
        incomingIndex={incomingIndex}
        totalSlides={totalSlides}
        containerRef={containerRef}
        trackRef={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Screen-reader live region for slide announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Showing banner ${currentIndex + 1} of ${totalSlides}`}
      </div>

      {totalSlides > 1 && (
        <BannerCarouselDots banners={banners} currentIndex={currentIndex} onSelect={goToIndex} />
      )}
    </section>
  );
};
