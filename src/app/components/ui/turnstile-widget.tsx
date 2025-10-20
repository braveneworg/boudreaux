'use client';

import React from 'react';

import Turnstile, { useTurnstile } from 'react-turnstile';

const TurnstileWidget = ({ setIsVerified }: { setIsVerified: (isVerified: boolean) => void }) => {
  const turnstile = useTurnstile();

  const getSiteKey = () => {
    if (process.env.NODE_ENV === 'production') {
      return process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY!;
    }
    return process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY!;
  };

  const handleReset = () => {
    turnstile.reset();
    setIsVerified(false);
  };

  return (
    <Turnstile
      onError={handleReset}
      onExpire={handleReset}
      onTimeout={handleReset}
      onVerify={() => {
        setIsVerified(true);
      }}
      sitekey={getSiteKey()}
    />
  );
};

export default TurnstileWidget;
