/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { Loader2Icon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Separator } from '@/app/components/ui/separator';
import TurnstileWidget from '@/app/components/ui/turnstile-widget';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';

export const CheckoutForm = () => {
  const checkoutState = useCheckout();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const handleConfirm = useCallback(async () => {
    if (checkoutState.type !== 'success') return;

    setIsProcessing(true);
    setError(null);

    const turnstileResult = await verifyTurnstile(turnstileToken);

    if (!turnstileResult.success) {
      setError(turnstileResult.error ?? 'Bot verification failed. Please try again.');
      setIsProcessing(false);
      setIsVerified(false);
      setTurnstileToken('');
      return;
    }

    const result = await checkoutState.checkout.confirm({
      redirect: 'if_required',
    });

    if (result.type === 'error') {
      setError(result.error.message);
      setIsProcessing(false);
      return;
    }

    window.location.href = `/subscribe/success?session_id=${result.session.id}`;
  }, [checkoutState, turnstileToken]);

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex min-h-[200px] items-center justify-center" role="status">
        <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return <p className="text-destructive text-sm">{checkoutState.error.message}</p>;
  }

  const { checkout } = checkoutState;
  const lineItem = checkout.lineItems[0];
  const recurring = lineItem?.recurring ?? checkout.recurring;

  return (
    <div className="space-y-4">
      {lineItem && (
        <div className="flex items-center justify-between text-sm">
          <span>{lineItem.name}</span>
          <span className="font-medium">
            {lineItem.unitAmount.amount}
            {recurring && `/${recurring.interval}`}
          </span>
        </div>
      )}

      <Separator />

      <PaymentElement />

      <TurnstileWidget
        isVerified={isVerified}
        setIsVerified={setIsVerified}
        onToken={setTurnstileToken}
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        className="w-full"
        onClick={handleConfirm}
        disabled={!checkout.canConfirm || !isVerified || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Subscribe — ${checkout.total.total.amount}/${recurring?.interval ?? 'month'}`
        )}
      </Button>
    </div>
  );
};
