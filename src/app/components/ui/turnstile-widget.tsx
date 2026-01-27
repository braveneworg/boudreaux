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
  const siteKey =
    process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY!
      : process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY!;

  // eslint-disable-next-line no-console
  console.log(
    `23: turnstile-widget > public turnstile key >>>`,
    process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY!
  );

  const handleReset = () => {
    turnstile.reset();
    setIsVerified(false);
  };

  return (
    <div className="w-full flex justify-center items-center">
      <Turnstile
        onError={handleReset}
        onExpire={handleReset}
        onTimeout={handleReset}
        onVerify={() => {
          setIsVerified(true);
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
