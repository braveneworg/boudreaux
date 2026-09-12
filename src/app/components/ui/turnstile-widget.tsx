/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useEffect } from 'react';

import Turnstile, { useTurnstile } from 'react-turnstile';

import { useMediaQuery } from '@/lib/utils/use-media-query';

export const TurnstileWidget = ({
  isVerified: _isVerified,
  setIsVerified,
  onToken,
}: {
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  onToken?: (token: string) => void;
}) => {
  const turnstile = useTurnstile();
  const isSmallMobile = useMediaQuery('(max-width: 360px)');
  // Cloudflare's public test site key — always passes verification.
  const siteKey =
    process.env.NODE_ENV === 'production'
      ? (process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY ?? '')
      : (process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY ?? '');

  // The test key always passes. Auto-verify on mount so E2E and local runs
  // don't depend on Cloudflare's challenge script loading — but never in real
  // production, where only the widget's own `onVerify` may unlock the form
  // (the server refuses sign-in without a verified token anyway).
  // NEXT_PUBLIC_E2E_MODE is inlined at build time: set for the E2E build,
  // absent from the production build.
  const autoVerify =
    process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_E2E_MODE === 'true';

  useEffect(() => {
    if (!autoVerify) {
      return;
    }
    setIsVerified(true);
    onToken?.('mock-turnstile-token');
  }, [autoVerify, onToken, setIsVerified]);

  const handleReset = () => {
    turnstile.reset();
    setIsVerified(false);
    onToken?.('');
  };

  return (
    <div className="flex w-full items-center justify-center">
      <Turnstile
        onError={handleReset}
        onExpire={handleReset}
        onTimeout={handleReset}
        onVerify={(token) => {
          setIsVerified(true);
          onToken?.(token);
        }}
        sitekey={siteKey}
        theme="light"
        size={isSmallMobile ? 'compact' : 'flexible'}
        className="mx-auto mt-3 mb-0"
      />
    </div>
  );
};
