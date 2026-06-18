/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Image from 'next/image';

import { flushSync } from 'react-dom';

import {
  BANNER_ASPECT_PADDING,
  BANNER_CDN_PATH,
  DEFAULT_ROTATION_INTERVAL,
} from '@/lib/constants/banner-slots';
import { cn } from '@/lib/utils';
import { isDarkColor } from '@/lib/utils/color';
import {
  addLinkAttributes,
  sanitizeNotificationHtml,
} from '@/lib/validation/banner-notification-schema';

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

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;
const TRANSITION_DURATION = 400; // ms — matches CSS transition
const EASING = 'cubic-bezier(0.42, 0, 0.58, 1)'; // ease-in-out

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

  // Pointer tracking refs for drag/swipe
  const pointerStartXRef = useRef(0);
  const pointerStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentDragXRef = useRef(0);

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

  // Derive outgoing and incoming notification strips for seamless crossfade
  const isTransitioning = incomingIndex !== null;
  const outgoingNotification = banners.at(currentIndex)?.notification ?? null;
  const incomingNotification =
    incomingIndex !== null ? (banners.at(incomingIndex)?.notification ?? null) : null;
  // Show the strip container when either the static notification or incoming notification exists
  const activeNotification = isTransitioning ? incomingNotification : outgoingNotification;
  const stripVisible = activeNotification !== null && isTabVisible;

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
  const outgoingHtml = sanitizedHtmlByIndex.at(currentIndex) ?? null;
  const activeHtml =
    isTransitioning && incomingIndex !== null
      ? (sanitizedHtmlByIndex.at(incomingIndex) ?? null)
      : outgoingHtml;

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

  // Pointer-based drag/swipe handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isAnimatingRef.current || totalSlides <= 1) return;
      isDraggingRef.current = true;
      pointerStartXRef.current = e.clientX;
      pointerStartTimeRef.current = Date.now();
      currentDragXRef.current = 0;

      withTrack((track) => {
        track.style.transition = 'none';
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      });
    },
    [totalSlides, withTrack]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - pointerStartXRef.current;
      // Apply elastic resistance (10% of drag distance beyond edge)
      const width = measureWidth(1);
      const elasticDelta =
        Math.abs(deltaX) > width * 0.5
          ? Math.sign(deltaX) * (width * 0.5 + (Math.abs(deltaX) - width * 0.5) * 0.1)
          : deltaX;
      currentDragXRef.current = elasticDelta;

      withTrack((track) => {
        track.style.transform = `translateX(${elasticDelta}px)`;
      });
    },
    [measureWidth, withTrack]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (isAnimatingRef.current) return;

      const deltaX = currentDragXRef.current;
      const elapsed = Date.now() - pointerStartTimeRef.current;
      const velocity = elapsed > 0 ? (deltaX / elapsed) * 1000 : 0;
      const width = measureWidth(0);

      if (deltaX < -SWIPE_THRESHOLD || velocity < -VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const next = (currentIndexRef.current + 1) % totalSlides;
        setIncomingIndex(next);
        animateTrack(-width, () => completeTransition(next));
      } else if (deltaX > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const prev = (currentIndexRef.current - 1 + totalSlides) % totalSlides;
        setIncomingIndex(prev);
        animateTrack(width, () => completeTransition(prev));
      } else {
        // Snap back to center
        animateTrack(0, () => {
          isAnimatingRef.current = false;
        });
      }
      resetTimer();
    },
    [totalSlides, measureWidth, animateTrack, completeTransition, resetTimer]
  );

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
      {/* Notification strip — always reserves 2.5rem to prevent CLS */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          minHeight: '2.5rem',
          opacity: stripVisible ? 1 : 0,
          transition: `opacity 300ms ${EASING}`,
        }}
      >
        {/* Outgoing strip — slides out to the right during transitions */}
        {isTransitioning && outgoingNotification && (
          <div
            key={`strip-out-${currentIndex}`}
            className={cn(
              'banner-strip-slide absolute inset-0 w-full px-4 py-2 text-center text-sm',
              isDarkColor(outgoingNotification.backgroundColor)
                ? 'banner-strip-dark'
                : 'banner-strip-light'
            )}
            style={{
              color: outgoingNotification.textColor ?? undefined,
              backgroundColor: outgoingNotification.backgroundColor ?? 'transparent',
              animation: `banner-strip-exit-right ${TRANSITION_DURATION}ms ${EASING} forwards`,
            }}
            dangerouslySetInnerHTML={{
              __html: outgoingHtml ?? '',
            }}
          />
        )}
        {/* Incoming strip — slides in from the left; static strip when not transitioning */}
        {activeNotification && (
          <div
            key={`strip-${isTransitioning ? `in-${incomingIndex}` : currentIndex}`}
            className={cn(
              'banner-strip-slide w-full px-4 py-2 text-center text-sm',
              isDarkColor(activeNotification.backgroundColor)
                ? 'banner-strip-dark'
                : 'banner-strip-light'
            )}
            style={{
              color: activeNotification.textColor ?? undefined,
              backgroundColor: activeNotification.backgroundColor ?? 'transparent',
              ...(isTransitioning
                ? {
                    animation: `banner-strip-slide-right ${TRANSITION_DURATION}ms ${EASING}`,
                  }
                : {}),
            }}
            dangerouslySetInnerHTML={{
              __html: activeHtml ?? '',
            }}
          />
        )}
      </div>

      {/* Banner image track */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ paddingBottom: BANNER_ASPECT_PADDING }}
      >
        <div
          ref={trackRef}
          className="absolute inset-0 touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="group"
          aria-roledescription="slide"
          aria-label={`Banner ${currentIndex + 1} of ${totalSlides}`}
        >
          {banners.map((banner, idx) => {
            const isCurrentSlide = idx === currentIndex;
            const isPrevSlide = idx === prevIndex;
            const isNextSlide = idx === nextIndex;
            const isVisible = isCurrentSlide || (totalSlides > 1 && (isPrevSlide || isNextSlide));
            // Mount the current and any adjacent (or incoming) slide eagerly.
            // Browser still respects fetchPriority/loading hints below, so the
            // LCP image wins the priority queue while the rest stream in.
            const isIncoming = idx === incomingIndex;
            const shouldRenderImage = isCurrentSlide || isIncoming || isVisible;

            return (
              <div
                key={banner.slotNumber}
                className="pointer-events-none absolute inset-0 select-none"
                style={{
                  transform: isPrevSlide
                    ? 'translateX(-100%)'
                    : isNextSlide
                      ? 'translateX(100%)'
                      : isCurrentSlide
                        ? 'translateX(0)'
                        : 'translateX(-200%)',
                  visibility: isVisible ? 'visible' : 'hidden',
                }}
              >
                {shouldRenderImage && (
                  // `priority` on the first slide is REQUIRED for mobile LCP.
                  // HomeContent is a client component hydrated from a TanStack
                  // Query cache, so without the server-rendered `<link rel=preload>`
                  // that `priority` emits, the browser can't discover the banner
                  // until hydration completes — pushing LCP to ~9s in Lighthouse
                  // (mobile, where this carousel is the visible treatment).
                  // Trade-off: on desktop the carousel is `md:hidden` and the
                  // `BannerStrip` is shown, so this preload is "preloaded but not
                  // used" there. That is an accepted, cosmetic dev-console warning —
                  // a media-scoped preload isn't expressible via `next/image`, and
                  // the mobile LCP win far outweighs it. DO NOT remove `priority`
                  // to silence that warning (doing so regressed LCP 90→67).
                  <Image
                    src={buildBannerSrc(banner.imageFilename)}
                    alt={`Banner ${banner.slotNumber}`}
                    fill
                    // The carousel is full-bleed below `xl` but its `<main>`
                    // ancestor caps width at `max-w-7xl` (1280px) from the `xl`
                    // breakpoint up, so above 1280px the banner never fills the
                    // viewport. Match `sizes` to that layout so the browser (and
                    // the `priority` preload) picks the 1280px variant instead
                    // of a needlessly large full-viewport one on wide screens.
                    sizes="(min-width: 1280px) 1280px, 100vw"
                    priority={idx === 0 && currentIndex === 0}
                    fetchPriority={isCurrentSlide ? 'high' : 'low'}
                    loading={isCurrentSlide ? 'eager' : 'lazy'}
                    className="object-cover"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Screen-reader live region for slide announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Showing banner ${currentIndex + 1} of ${totalSlides}`}
      </div>

      {/* Dot indicators */}
      {totalSlides > 1 && (
        <div className="flex justify-center gap-2 py-2" role="tablist" aria-label="Banner slides">
          {banners.map((banner, idx) => (
            <button
              key={banner.slotNumber}
              type="button"
              role="tab"
              aria-selected={idx === currentIndex}
              aria-label={`Go to banner ${idx + 1}`}
              className="flex h-11 w-11 items-center justify-center p-0"
              onClick={() => goToIndex(idx)}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  idx === currentIndex ? 'bg-foreground' : 'bg-foreground/30'
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
