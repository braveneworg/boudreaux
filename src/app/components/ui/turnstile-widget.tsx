'use client';

import React from 'react';

import Turnstile, { useTurnstile } from 'react-turnstile';

const TurnstileWidget = ({
  isVerified: _isVerified,
  setIsVerified,
}: {
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
}) => {
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
    <div className="w-full flex justify-center">
      <Turnstile
        onError={handleReset}
        onExpire={handleReset}
        onTimeout={handleReset}
        onVerify={() => {
          setIsVerified(true);
        }}
        sitekey={getSiteKey()}
        theme="light"
        size="normal"
      />
    </div>
  );
};

export default TurnstileWidget;
