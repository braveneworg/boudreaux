/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React from 'react';

import Turnstile, { useTurnstile } from 'react-turnstile';

const TurnstileWidget = ({
  isVerified: _isVerified,
  setIsVerified,
  onToken,
}: {
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  onToken?: (token: string) => void;
}) => {
  const turnstile = useTurnstile();
  const siteKey =
    process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY!
      : process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY!;

  const handleReset = () => {
    turnstile.reset();
    setIsVerified(false);
    onToken?.('');
  };

  return (
    <div className="w-full flex justify-center items-center">
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
        size="flexible"
        className="max-w-full mt-3 mb-0"
      />
    </div>
  );
};

export default TurnstileWidget;
