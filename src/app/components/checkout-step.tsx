/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { CheckoutProvider } from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import { Loader2Icon } from 'lucide-react';

import { CheckoutForm } from '@/app/components/checkout-form';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { createCheckoutSessionAction } from '@/lib/actions/create-checkout-session-action';
import type { SubscriberRateTier } from '@/lib/subscriber-rates';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

interface CheckoutStepProps {
  tier: SubscriberRateTier;
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
}

export const CheckoutStep = ({ tier, customerEmail, stripeCustomerId }: CheckoutStepProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const createSession = async () => {
      try {
        const result = await createCheckoutSessionAction(
          tier,
          customerEmail ?? undefined,
          stripeCustomerId ?? undefined
        );

        if (cancelled) return;

        if (result.error || !result.clientSecret) {
          setError(result.error ?? 'Failed to initialize checkout');
          return;
        }

        setClientSecret(result.clientSecret);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Checkout session error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize checkout');
      }
    };

    createSession();

    return () => {
      cancelled = true;
    };
  }, [tier, customerEmail, stripeCustomerId]);

  if (error) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>Something went wrong</DialogDescription>
        </DialogHeader>
        <p className="text-destructive text-sm">{error}</p>
      </>
    );
  }

  if (!clientSecret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>Complete your subscription</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-75 items-center justify-center" role="status">
          <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Checkout</DialogTitle>
        <DialogDescription>Complete your subscription</DialogDescription>
      </DialogHeader>
      <CheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm />
      </CheckoutProvider>
    </>
  );
};
