/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { animate, AnimatePresence, motion, useMotionValue } from 'framer-motion';

import { DEFAULT_ROTATION_INTERVAL } from '@/lib/constants/banner-slots';
import { cn } from '@/lib/utils';
import { cloudfrontLoader } from '@/lib/utils/cloudfront-loader';
import { isDarkColor } from '@/lib/utils/color';
import { addLinkAttributes } from '@/lib/validation/banner-notification-schema';

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

const SLIDE_TRANSITION = {
  type: 'tween' as const,
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

/** Notification strip slides opposite to banner direction */
const stripVariants = {
  enter: (dir: number) => ({ x: `${dir * -100}%` }),
  center: { x: '0%' },
  exit: (dir: number) => ({ x: `${dir * 100}%` }),
};

/**
 * BannerCarousel displays rotating banner images with optional notification
 * strips. Uses a single-track approach: prev/current/next slides live in one
 * container driven by a shared MotionValue, guaranteeing zero gap between
 * slides during transitions and swipes.
 */
export function BannerCarousel({
  banners,
  rotationInterval = DEFAULT_ROTATION_INTERVAL,
  className,
}: BannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const currentIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalSlides = banners.length;

  /** Single motion value drives ALL slides — zero gap guaranteed */
  const trackX = useMotionValue(0);

  /** Finish a slide transition: update index and reset track position */
  const completeTransition = useCallback(
    (toIndex: number) => {
      currentIndexRef.current = toIndex;
      setCurrentIndex(toIndex);
      trackX.jump(0);
      isAnimatingRef.current = false;
    },
    [trackX]
  );

  /** Animate the track to show a specific adjacent slide */
  const animateToSlide = useCallback(
    (toIndex: number, dir: number) => {
      if (isAnimatingRef.current || totalSlides <= 1) return;
      isAnimatingRef.current = true;
      setDirection(dir);
      const width = containerRef.current?.offsetWidth ?? 0;
      animate(trackX, -dir * width, {
        ...SLIDE_TRANSITION,
        onComplete: () => completeTransition(toIndex),
      });
    },
    [totalSlides, trackX, completeTransition]
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

  // Auto-rotation timer — FR-003, FR-012
  useEffect(() => {
    if (totalSlides <= 1) return;
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [totalSlides, resetTimer]);

  // Tab visibility handling — FR-013
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Keyboard navigation — FR-006
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

  // Swipe/drag — FR-005
  const handleDragEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: { offset: { x: number }; velocity: { x: number } }
    ) => {
      if (isAnimatingRef.current) return;

      const width = containerRef.current?.offsetWidth ?? 0;

      if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const next = (currentIndexRef.current + 1) % totalSlides;
        setDirection(1);
        animate(trackX, -width, {
          ...SLIDE_TRANSITION,
          onComplete: () => completeTransition(next),
        });
      } else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) {
        isAnimatingRef.current = true;
        const prev = (currentIndexRef.current - 1 + totalSlides) % totalSlides;
        setDirection(-1);
        animate(trackX, width, {
          ...SLIDE_TRANSITION,
          onComplete: () => completeTransition(prev),
        });
      } else {
        // Snap back to center
        animate(trackX, 0, SLIDE_TRANSITION);
      }
      resetTimer();
    },
    [totalSlides, trackX, completeTransition, resetTimer]
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
        trackX.jump(0);
      }
      resetTimer();
    },
    [totalSlides, animateToSlide, trackX, resetTimer]
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
      {/* Notification strip — FR-002, FR-011, FR-014, FR-016 */}
      {hasAnyNotification && (
        <AnimatePresence initial={false}>
          {currentNotification && isTabVisible ? (
            <motion.div
              key="strip-container"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full overflow-hidden py-px"
            >
              <AnimatePresence mode="popLayout" custom={direction}>
                <motion.div
                  key={`strip-${currentIndex}`}
                  custom={direction}
                  variants={stripVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={SLIDE_TRANSITION}
                  className={cn(
                    'w-full px-4 py-2 text-center text-sm',
                    isDarkColor(currentNotification.backgroundColor)
                      ? 'banner-strip-dark'
                      : 'banner-strip-light'
                  )}
                  style={{
                    color: currentNotification.textColor ?? undefined,
                    backgroundColor: currentNotification.backgroundColor ?? 'transparent',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: addLinkAttributes(currentNotification.content),
                  }}
                />
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      {/* Banner image track — single MotionValue drives all slides, zero gap */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ paddingBottom: '61.8%' }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ x: trackX }}
          drag={totalSlides > 1 ? 'x' : false}
          dragElastic={0.1}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
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
                sizes="(min-width: 360px) 100vw"
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
              sizes="(min-width: 360px) 100vw"
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
                sizes="(min-width: 360px) 100vw"
                className="object-cover"
              />
            </div>
          )}
        </motion.div>
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
              className={cn(
                'h-2 w-2 rounded-full transition-colors',
                idx === currentIndex ? 'bg-foreground' : 'bg-foreground/30'
              )}
              onClick={() => goToIndex(idx)}
            />
          ))}
        </div>
      )}
    </section>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
