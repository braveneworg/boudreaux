/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { DEFAULT_ROTATION_INTERVAL } from '@/lib/constants/banner-slots';
import { cn } from '@/lib/utils';
import { cloudfrontLoader } from '@/lib/utils/cloudfront-loader';
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
  className?: string;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;
const TRANSITION_DURATION = 400; // ms — matches CSS transition

/**
 * BannerCarousel displays rotating banner images with optional notification
 * strips. Uses CSS transitions and pointer events — zero framer-motion.
 */
export function BannerCarousel({
  banners,
  rotationInterval = DEFAULT_ROTATION_INTERVAL,
  className,
}: BannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [stripVisible, setStripVisible] = useState(true);
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

  /** Apply a CSS transition to the track and move it */
  const animateTrack = useCallback((targetX: number, onComplete: () => void) => {
    const track = trackRef.current;
    if (!track) return;

    track.style.transition = `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    track.style.transform = `translateX(${targetX}px)`;

    const handleEnd = () => {
      track.removeEventListener('transitionend', handleEnd);
      onComplete();
    };
    track.addEventListener('transitionend', handleEnd);
  }, []);

  /** Reset track position instantly (no transition) */
  const resetTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
  }, []);

  /** Finish a slide transition: update index and reset track position */
  const completeTransition = useCallback(
    (toIndex: number) => {
      currentIndexRef.current = toIndex;
      setCurrentIndex(toIndex);
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
      setDirection(dir);
      const width = containerRef.current?.offsetWidth ?? 0;
      animateTrack(-dir * width, () => completeTransition(toIndex));
    },
    [totalSlides, animateTrack, completeTransition]
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
    if (timerRef.current) clearInterval(timerRef.current);
    if (totalSlides <= 1) return;
    timerRef.current = setInterval(goToNext, rotationInterval * 1000);
  }, [goToNext, rotationInterval, totalSlides]);

  // Auto-rotation timer
  useEffect(() => {
    if (totalSlides <= 1) return;
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [totalSlides, resetTimer]);

  // Tab visibility handling
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Update strip visibility when notification changes
  useEffect(() => {
    const currentBanner = banners[currentIndex];
    setStripVisible(currentBanner?.notification !== null && isTabVisible);
  }, [currentIndex, banners, isTabVisible]);

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

      const track = trackRef.current;
      if (track) {
        track.style.transition = 'none';
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [totalSlides]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - pointerStartXRef.current;
    // Apply elastic resistance (10% of drag distance beyond edge)
    const width = containerRef.current?.offsetWidth ?? 1;
    const elasticDelta =
      Math.abs(deltaX) > width * 0.5
        ? Math.sign(deltaX) * (width * 0.5 + (Math.abs(deltaX) - width * 0.5) * 0.1)
        : deltaX;
    currentDragXRef.current = elasticDelta;

    const track = trackRef.current;
    if (track) {
      track.style.transform = `translateX(${elasticDelta}px)`;
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (isAnimatingRef.current) return;

      const deltaX = currentDragXRef.current;
      const elapsed = Date.now() - pointerStartTimeRef.current;
      const velocity = elapsed > 0 ? (deltaX / elapsed) * 1000 : 0;
      const width = containerRef.current?.offsetWidth ?? 0;

      if (deltaX < -SWIPE_THRESHOLD || velocity < -VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const next = (currentIndexRef.current + 1) % totalSlides;
        setDirection(1);
        animateTrack(-width, () => completeTransition(next));
      } else if (deltaX > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const prev = (currentIndexRef.current - 1 + totalSlides) % totalSlides;
        setDirection(-1);
        animateTrack(width, () => completeTransition(prev));
      } else {
        // Snap back to center
        animateTrack(0, () => {
          isAnimatingRef.current = false;
        });
      }
      resetTimer();
    },
    [totalSlides, animateTrack, completeTransition, resetTimer]
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
        const dir = idx > currentIndexRef.current ? 1 : -1;
        setDirection(dir);
        currentIndexRef.current = idx;
        setCurrentIndex(idx);
        resetTrack();
      }
      resetTimer();
    },
    [totalSlides, animateToSlide, resetTrack, resetTimer]
  );

  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];
  const currentNotification = currentBanner?.notification;
  const hasAnyNotification = banners.some((b) => b.notification !== null);

  const prevIndex = (currentIndex - 1 + totalSlides) % totalSlides;
  const nextIndex = (currentIndex + 1) % totalSlides;

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Carousel widget requires keyboard interaction per WAI-ARIA carousel pattern */
  return (
    <section
      className={cn('relative w-full overflow-hidden', className)}
      aria-label="Banner carousel"
      aria-roledescription="carousel"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Notification strip */}
      {hasAnyNotification && (
        <div
          className="relative w-full overflow-hidden py-px"
          style={{
            maxHeight: stripVisible && currentNotification ? '100px' : '0px',
            opacity: stripVisible && currentNotification ? 1 : 0,
            transition:
              'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {currentNotification && (
            <div
              key={`strip-${currentIndex}`}
              className={cn(
                'w-full px-4 py-2 text-center text-sm banner-strip-slide',
                isDarkColor(currentNotification.backgroundColor)
                  ? 'banner-strip-dark'
                  : 'banner-strip-light'
              )}
              style={{
                color: currentNotification.textColor ?? undefined,
                backgroundColor: currentNotification.backgroundColor ?? 'transparent',
                animation: `banner-strip-slide-${direction > 0 ? 'left' : 'right'} ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
              dangerouslySetInnerHTML={{
                __html: addLinkAttributes(sanitizeNotificationHtml(currentNotification.content)),
              }}
            />
          )}
        </div>
      )}

      {/* Banner image track */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ paddingBottom: '61.8%' }}
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
          {/* Previous slide — positioned at -100% of current */}
          {totalSlides > 1 && (
            <div
              className="absolute inset-0 pointer-events-none select-none"
              style={{ transform: 'translateX(-100%)' }}
            >
              <Image
                loader={cloudfrontLoader}
                src={banners[prevIndex].imageFilename}
                alt={`Banner ${banners[prevIndex].slotNumber}`}
                fill
                sizes="100vw"
                className="object-cover"
              />
            </div>
          )}

          {/* Current slide — centered */}
          <div className="absolute inset-0 pointer-events-none select-none">
            <Image
              loader={cloudfrontLoader}
              src={currentBanner.imageFilename}
              alt={`Banner ${currentBanner.slotNumber}`}
              fill
              sizes="100vw"
              priority={currentIndex === 0}
              className="object-cover"
            />
          </div>

          {/* Next slide — positioned at +100% of current */}
          {totalSlides > 1 && (
            <div
              className="absolute inset-0 pointer-events-none select-none"
              style={{ transform: 'translateX(100%)' }}
            >
              <Image
                loader={cloudfrontLoader}
                src={banners[nextIndex].imageFilename}
                alt={`Banner ${banners[nextIndex].slotNumber}`}
                fill
                sizes="100vw"
                className="object-cover"
              />
            </div>
          )}
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
              className="flex items-center justify-center h-11 w-11 p-0"
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
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
