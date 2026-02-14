'use client';

import { useCallback, useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { AnimatePresence, motion } from 'framer-motion';

import type { NotificationBanner as NotificationBannerType } from '@/lib/services/notification-banner-service';
import { cn } from '@/lib/utils';

/**
 * Golden ratio constant used to calculate banner height
 * Height = Width / GOLDEN_RATIO
 */
const GOLDEN_RATIO = 1.618;

/**
 * Auto-cycle interval in milliseconds (~6.5 seconds)
 */
const AUTO_CYCLE_INTERVAL = 6500;

interface NotificationBannerProps {
  notifications: NotificationBannerType[];
  className?: string;
}

/**
 * NotificationBanner component displays a carousel of notification banners
 * at the top of the home page with auto-cycling and navigation dots.
 *
 * Features:
 * - Golden ratio-based responsive height
 * - Auto-cycling every ~6.5 seconds
 * - Smooth transitions with easing
 * - Navigation dots for manual selection
 * - Full viewport width images
 * - Accessible with ARIA roles and keyboard navigation
 */
export function NotificationBanner({ notifications, className }: NotificationBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  const totalNotifications = notifications.length;

  // Navigate to next notification
  const goToNext = useCallback(() => {
    if (totalNotifications <= 1) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % totalNotifications);
  }, [totalNotifications]);

  // Navigate to previous notification
  const goToPrevious = useCallback(() => {
    if (totalNotifications <= 1) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + totalNotifications) % totalNotifications);
  }, [totalNotifications]);

  // Navigate to specific notification
  const goToIndex = useCallback(
    (index: number) => {
      if (index === currentIndex) {
        return;
      }
      setDirection(index > currentIndex ? 1 : -1);
      setCurrentIndex(index);
    },
    [currentIndex]
  );

  // Handle swipe/drag end
  const handleDragEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: { offset: { x: number }; velocity: { x: number } }
    ) => {
      const swipeThreshold = 50;
      const velocityThreshold = 500;

      // Determine swipe direction based on offset and velocity
      if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
        goToNext();
      } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
        goToPrevious();
      }
    },
    [goToNext, goToPrevious]
  );

  // Auto-cycle effect
  useEffect(() => {
    if (totalNotifications <= 1 || isPaused) return;

    const interval = setInterval(goToNext, AUTO_CYCLE_INTERVAL);
    return () => clearInterval(interval);
  }, [goToNext, totalNotifications, isPaused]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        goToPrevious();
      } else if (event.key === 'ArrowRight') {
        goToNext();
      }
    },
    [goToNext, goToPrevious]
  );

  if (notifications.length === 0) {
    return null;
  }

  const currentNotification = notifications[currentIndex];

  return (
    <section
      className={cn('relative w-full max-w-xl mx-auto overflow-hidden mt-1', className)}
      role="region"
      aria-label="Notification banner"
      aria-roledescription="carousel"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      tabIndex={0}
    >
      {/* Preload all images to prevent broken image icons when cycling */}
      <div className="hidden" aria-hidden="true">
        {notifications.map((notification) => {
          // Preload the image - text overlay is rendered dynamically, not burned in
          const preloadUrl = notification.imageUrl || notification.originalImageUrl;
          return preloadUrl ? (
            <Image
              key={notification.id}
              src={preloadUrl}
              alt=""
              fill
              sizes="100vw"
              priority
              unoptimized
            />
          ) : null;
        })}
      </div>

      {/* Banner container with golden ratio height */}
      <div
        className="relative w-full"
        style={{
          paddingBottom: `${100 / GOLDEN_RATIO}%`,
        }}
      >
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={currentNotification?.id || currentIndex}
            custom={direction}
            initial="enter"
            animate="center"
            exit="exit"
            variants={{
              enter: (dir: number) => ({ x: `${dir * 100}%` }),
              center: { x: 0 },
              exit: (dir: number) => ({ x: `${dir * -100}%` }),
            }}
            transition={{
              x: { type: 'tween', duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
            }}
            drag={totalNotifications > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'pan-y' }}
            role="group"
            aria-roledescription="slide"
            aria-label={`${currentIndex + 1} of ${totalNotifications}`}
          >
            <BannerSlide notification={currentNotification} isFirst={currentIndex === 0} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation dots */}
      {totalNotifications > 1 && (
        <NavigationDots total={totalNotifications} current={currentIndex} onSelect={goToIndex} />
      )}
    </section>
  );
}

interface BannerSlideProps {
  notification: NotificationBannerType | undefined;
  isFirst?: boolean;
}

/**
 * Convert hex color to rgba with opacity
 */
const hexToRgba = (hex: string, opacity: number): string => {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(255, 255, 255, ${opacity})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

function BannerSlide({ notification, isFirst = false }: BannerSlideProps) {
  if (!notification) return null;

  const {
    message,
    secondaryMessage,
    originalImageUrl,
    imageUrl,
    linkUrl,
    backgroundColor,
    isOverlayed,
    messageFont,
    messageFontSize,
    messageContrast,
    secondaryMessageFont,
    secondaryMessageFontSize,
    secondaryMessageContrast,
    messageTextColor,
    secondaryMessageTextColor,
    messageTextShadow,
    messageTextShadowDarkness,
    secondaryMessageTextShadow,
    secondaryMessageTextShadowDarkness,
    messagePositionX,
    messagePositionY,
    secondaryMessagePositionX,
    secondaryMessagePositionY,
    messageRotation,
    secondaryMessageRotation,
    imageOffsetX,
    imageOffsetY,
    messageWidth,
    messageHeight,
    secondaryMessageWidth,
    secondaryMessageHeight,
  } = notification;

  // When isOverlayed is enabled, use the originalImageUrl (non-overlayed) because
  // the text overlay is rendered dynamically via CSS, not burned into the image.
  // Otherwise, use the processed imageUrl or fall back to originalImageUrl.
  const displayImageUrl =
    isOverlayed && originalImageUrl ? originalImageUrl : imageUrl || originalImageUrl;
  const hasImage = !!displayImageUrl;
  const hasLink = !!linkUrl;

  const content = (
    <div
      className={cn('absolute inset-0', !hasImage && 'bg-zinc-900')}
      style={{
        backgroundColor: !hasImage && backgroundColor ? backgroundColor : undefined,
      }}
    >
      {/* Background image */}
      {hasImage && (
        <Image
          src={displayImageUrl}
          alt={message}
          fill
          className="object-cover"
          style={{
            objectPosition: `calc(50% + ${imageOffsetX ?? 0}%) calc(50% + ${imageOffsetY ?? 0}%)`,
          }}
          priority={isFirst}
          sizes="100vw"
          unoptimized
        />
      )}

      {/* Text overlay - matching the form preview styling */}
      {isOverlayed && (
        <>
          {/* Main message */}
          <div
            className="absolute flex items-center justify-center text-center"
            style={{
              left: `${messagePositionX ?? 50}%`,
              top: `${messagePositionY ?? 10}%`,
              width: `${messageWidth ?? 80}%`,
              height: `${messageHeight ?? 30}%`,
              transform: `translate(-50%, -50%) rotate(${messageRotation ?? 0}deg)`,
            }}
          >
            <span
              className="px-2 text-center"
              style={{
                fontFamily:
                  messageFont === 'system-ui'
                    ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    : `'${messageFont}', system-ui, sans-serif`,
                fontSize: `${messageFontSize ?? 2.5}rem`,
                color: hexToRgba(messageTextColor || '#ffffff', (messageContrast ?? 100) / 100),
                textShadow:
                  messageTextShadow && hasImage
                    ? `0 2px 4px rgba(0,0,0,${0.3 + ((messageTextShadowDarkness ?? 50) / 100) * 0.6}), 0 4px 8px rgba(0,0,0,${0.2 + ((messageTextShadowDarkness ?? 50) / 100) * 0.4})`
                    : messageTextShadow
                      ? `0 1px 3px rgba(0,0,0,0.3)`
                      : 'none',
                fontWeight: 'normal',
                textTransform: 'none',
                letterSpacing: 'normal',
              }}
            >
              {message}
            </span>
          </div>

          {/* Secondary message */}
          {secondaryMessage && (
            <div
              className="absolute flex items-center justify-center text-center"
              style={{
                left: `${secondaryMessagePositionX ?? 50}%`,
                top: `${secondaryMessagePositionY ?? 90}%`,
                width: `${secondaryMessageWidth ?? 80}%`,
                height: `${secondaryMessageHeight ?? 30}%`,
                transform: `translate(-50%, -50%) rotate(${secondaryMessageRotation ?? 0}deg)`,
              }}
            >
              <span
                className="px-2 text-center"
                style={{
                  fontFamily:
                    secondaryMessageFont === 'system-ui'
                      ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                      : `'${secondaryMessageFont}', system-ui, sans-serif`,
                  fontSize: `${secondaryMessageFontSize ?? 2}rem`,
                  color: hexToRgba(
                    secondaryMessageTextColor || '#ffffff',
                    (secondaryMessageContrast ?? 95) / 100
                  ),
                  textShadow:
                    secondaryMessageTextShadow && hasImage
                      ? `0 1px 3px rgba(0,0,0,${0.3 + ((secondaryMessageTextShadowDarkness ?? 50) / 100) * 0.5}), 0 2px 6px rgba(0,0,0,${0.2 + ((secondaryMessageTextShadowDarkness ?? 50) / 100) * 0.3})`
                      : secondaryMessageTextShadow
                        ? `0 1px 2px rgba(0,0,0,0.3)`
                        : 'none',
                  fontWeight: 'normal',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                }}
              >
                {secondaryMessage}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (hasLink) {
    return (
      <Link
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block absolute inset-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
        aria-label={`${message}${secondaryMessage ? ` - ${secondaryMessage}` : ''} (opens in new tab)`}
      >
        {content}
      </Link>
    );
  }

  return content;
}

interface NavigationDotsProps {
  total: number;
  current: number;
  onSelect: (index: number) => void;
}

function NavigationDots({ total, current, onSelect }: NavigationDotsProps) {
  return (
    <nav
      className="flex items-center justify-center gap-1"
      role="tablist"
      aria-label="Banner navigation"
    >
      {Array.from({ length: total }, (_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === current}
          aria-label={`Go to banner ${index + 1}`}
          onClick={() => onSelect(index)}
          className="w-10 h-10 flex items-center justify-center focus:outline-none group"
        >
          {/* Visual dot - small but with large click target from parent */}
          <span
            className={cn(
              'w-2 h-2 rounded-full border border-zinc-900 transition-colors duration-300',
              'group-focus:ring-2 group-focus:ring-offset-2 group-focus:ring-zinc-900',
              'group-hover:bg-zinc-700',
              index === current ? 'bg-zinc-900' : 'bg-transparent'
            )}
          />
        </button>
      ))}
    </nav>
  );
}
