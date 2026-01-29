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
 * Auto-cycle interval in milliseconds (10 seconds as per spec)
 */
const AUTO_CYCLE_INTERVAL = 10000;

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
 * - Auto-cycling every 10 seconds
 * - Smooth transitions with easing
 * - Navigation dots for manual selection
 * - Full viewport width images
 * - Accessible with ARIA roles and keyboard navigation
 */
export function NotificationBanner({ notifications, className }: NotificationBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const totalNotifications = notifications.length;

  // Navigate to next notification
  const goToNext = useCallback(() => {
    if (totalNotifications <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % totalNotifications);
  }, [totalNotifications]);

  // Navigate to specific notification
  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

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
        setCurrentIndex((prev) => (prev - 1 + totalNotifications) % totalNotifications);
      } else if (event.key === 'ArrowRight') {
        goToNext();
      }
    },
    [goToNext, totalNotifications]
  );

  if (notifications.length === 0) {
    return null;
  }

  const currentNotification = notifications[currentIndex];

  return (
    <section
      className={cn(
        // Full-bleed: break out of parent padding to span full viewport width
        'relative w-screen overflow-hidden -mx-1.5',
        className
      )}
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
        {notifications.map((notification) =>
          notification.imageUrl ? (
            <Image
              key={notification.id}
              src={notification.imageUrl}
              alt=""
              fill
              sizes="100vw"
              priority
              unoptimized
            />
          ) : null
        )}
      </div>

      {/* Banner container with golden ratio height */}
      <div
        className="relative w-full"
        style={{
          paddingBottom: `${100 / GOLDEN_RATIO}%`,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentNotification?.id || currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{
              duration: 0.5,
              ease: [0.4, 0, 0.2, 1], // Cubic bezier easing
            }}
            className="absolute inset-0"
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
  } = notification;

  const hasImage = !!imageUrl;
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
          src={imageUrl}
          alt={message}
          fill
          className="object-cover"
          priority={isFirst}
          sizes="100vw"
          unoptimized
        />
      )}

      {/* Text overlay - matching the form preview styling */}
      {isOverlayed && (
        <>
          {/* Main message */}
          <span
            className="absolute px-2 text-center"
            style={{
              left: `${messagePositionX ?? 50}%`,
              top: `${messagePositionY ?? 10}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '90%',
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

          {/* Secondary message */}
          {secondaryMessage && (
            <span
              className="absolute px-2 text-center"
              style={{
                left: `${secondaryMessagePositionX ?? 50}%`,
                top: `${secondaryMessagePositionY ?? 90}%`,
                transform: 'translate(-50%, -50%)',
                maxWidth: '90%',
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
