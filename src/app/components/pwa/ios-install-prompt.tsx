/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { Share, SquarePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// iOS Safari has no `beforeinstallprompt` / native install banner — the only
// way to install a PWA there is manually via Share → Add to Home Screen. This
// banner detects iOS Safari (when the app is not already running standalone)
// and surfaces those instructions, since the OS will never prompt on its own.

const DISMISS_COOKIE = 'ffi-ios-install-dismissed';
const DISMISS_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

const hasDismissed = (): boolean =>
  document.cookie.split('; ').some((entry) => entry === `${DISMISS_COOKIE}=1`);

const persistDismissal = (): void => {
  document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=${DISMISS_MAX_AGE_SECONDS}; samesite=lax`;
};

const isIosSafari = (): boolean => {
  const ua = navigator.userAgent;

  // iPadOS 13+ reports a desktop ("MacIntel") UA, so fall back to touch points.
  const isIosDevice =
    /iphone|ipod|ipad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIosDevice) {
    return false;
  }

  // On iOS every engine is WebKit, but only Safari can Add to Home Screen.
  // Exclude the in-app/third-party browsers that advertise their own token.
  const isOtherBrowser = /crios|fxios|edgios|opt\//i.test(ua);
  return !isOtherBrowser;
};

const isStandalone = (): boolean => {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || globalThis.matchMedia('(display-mode: standalone)').matches;
};

export const IosInstallPrompt = (): React.ReactElement | null => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isIosSafari() && !isStandalone() && !hasDismissed()) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = (): void => {
    persistDismissal();
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Install Fake Four Inc."
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mx-auto mb-3 w-[calc(100%-1.5rem)] max-w-md',
        'bg-background rounded-xl border p-4 shadow-lg'
      )}
    >
      <div className="flex items-start gap-3">
        <SquarePlus aria-hidden className="text-foreground mt-0.5 size-5 shrink-0" />
        <div className="flex-1 text-sm">
          <p className="font-medium">Install Fake Four Inc.</p>
          <p className="text-muted-foreground mt-1">
            Tap the Share icon{' '}
            <Share aria-label="Share" className="inline size-4 -translate-y-px" />, then{' '}
            <span className="text-foreground font-medium">Add to Home Screen</span>.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss install instructions"
          onClick={handleDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};
