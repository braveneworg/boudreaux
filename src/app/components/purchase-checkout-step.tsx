/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, Loader2Icon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { createPurchaseCheckoutSessionAction } from '@/lib/actions/create-purchase-checkout-session-action';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_COUNT = 45;

const SESSION_ERROR_MESSAGES: Record<string, string> = {
  already_purchased: 'You have already purchased this release.',
  amount_below_minimum: 'The minimum purchase amount is $0.50.',
  release_unavailable: 'This release is no longer available for purchase.',
  stripe_error: 'A payment error occurred. Please try again or contact support.',
};

/**
 * Maps a machine-readable error code returned by the server action to a
 * human-friendly message suitable for display.
 */
function getSessionErrorMessage(code: string): string {
  return SESSION_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

interface PurchaseCheckoutStepProps {
  releaseId: string;
  releaseTitle: string;
  amountCents: number;
  userId: string;
  onConfirmed: () => void;
  onError: (message: string) => void;
}

/** Formats an integer cent amount to a USD display string, e.g. 500 → "$5.00". */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface PurchaseCheckoutFormProps {
  amountCents: number;
  onPaymentComplete: () => void;
}

const PurchaseCheckoutForm = ({ amountCents, onPaymentComplete }: PurchaseCheckoutFormProps) => {
  const checkoutState = useCheckout();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (checkoutState.type !== 'success') return;

    setIsConfirming(true);
    setError(null);

    const result = await checkoutState.checkout.confirm({ redirect: 'if_required' });

    if (result.type === 'error') {
      setError(result.error.message);
      setIsConfirming(false);
      return;
    }

    // Payment confirmed — trigger polling for webhook confirmation
    onPaymentComplete();
  }, [checkoutState, onPaymentComplete]);

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex min-h-50 items-center justify-center" role="status">
        <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return <p className="text-destructive text-sm">{checkoutState.error.message}</p>;
  }

  return (
    <div className="space-y-4">
      <PaymentElement />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        className="w-full"
        onClick={handleConfirm}
        disabled={!checkoutState.checkout.canConfirm || isConfirming}
      >
        {isConfirming ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay ${formatCents(amountCents)}`
        )}
      </Button>
    </div>
  );
};

interface PurchaseStatusResponse {
  confirmed: boolean;
}

/**
 * Checkout step for the PWYW release purchase flow.
 *
 * Creates a Stripe Checkout Session on mount, renders the embedded
 * PaymentElement inside a CheckoutProvider, and polls the purchase-status
 * endpoint after Stripe confirms the payment to wait for webhook processing.
 */
export const PurchaseCheckoutStep = ({
  releaseId,
  releaseTitle,
  amountCents,
  userId,
  onConfirmed,
  onError,
}: PurchaseCheckoutStepProps) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const createSession = async () => {
      try {
        const result = await createPurchaseCheckoutSessionAction({
          releaseId,
          amountCents,
          userId,
        });

        if (cancelled) return;

        if (!result.success) {
          const message = getSessionErrorMessage(result.error);
          setSessionError(message);
          onError(message);
          return;
        }

        setClientSecret(result.clientSecret);
        setPaymentIntentId(result.paymentIntentId);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to initialize checkout';
        console.error('Purchase checkout session error:', err);
        setSessionError(message);
        onError(message);
      }
    };

    createSession();

    return () => {
      cancelled = true;
    };
  }, [releaseId, releaseTitle, amountCents, userId, onError]);

  const { data: purchaseStatus } = useQuery<PurchaseStatusResponse>({
    queryKey: ['purchase-status', releaseId, paymentIntentId],
    queryFn: async () => {
      setPollCount((prev) => prev + 1);
      const res = await fetch(
        `/api/releases/${releaseId}/purchase-status?paymentIntentId=${paymentIntentId}`
      );
      if (!res.ok) throw new Error('Failed to fetch purchase status');
      return res.json() as Promise<PurchaseStatusResponse>;
    },
    enabled: paymentComplete && paymentIntentId !== null,
    refetchInterval: (query) => {
      const confirmed = query.state.data?.confirmed;
      const count = query.state.fetchStatus === 'idle' ? pollCount : pollCount;
      if (confirmed || count >= MAX_POLL_COUNT) return false;
      return POLL_INTERVAL_MS;
    },
  });

  useEffect(() => {
    if (purchaseStatus?.confirmed) {
      onConfirmed();
    }
  }, [purchaseStatus, onConfirmed]);

  const timedOut = paymentComplete && pollCount >= MAX_POLL_COUNT && !purchaseStatus?.confirmed;

  if (sessionError) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Purchase</DialogTitle>
          <DialogDescription>Something went wrong</DialogDescription>
        </DialogHeader>
        <p className="text-destructive text-sm">{sessionError}</p>
      </>
    );
  }

  if (!clientSecret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Purchase</DialogTitle>
          <DialogDescription>Preparing your checkout...</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-50 items-center justify-center" role="status">
          <Loader2Icon className="text-muted-foreground size-8 animate-spin" />
        </div>
      </>
    );
  }

  if (paymentComplete) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-green-500" />
            Payment received!
          </DialogTitle>
          <DialogDescription>
            {timedOut ? (
              <>
                This is taking longer than expected. Your payment was received &mdash; please check
                your email for a download link or contact{' '}
                <a href="mailto:support@fakefourinc.com" className="underline">
                  support@fakefourinc.com
                </a>
              </>
            ) : (
              'Confirming your purchase...'
            )}
          </DialogDescription>
        </DialogHeader>

        {!timedOut && (
          <div className="flex items-center justify-center py-6" role="status">
            <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Purchase {releaseTitle}</DialogTitle>
        <DialogDescription>You are paying {formatCents(amountCents)}</DialogDescription>
      </DialogHeader>
      <CheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <PurchaseCheckoutForm
          amountCents={amountCents}
          onPaymentComplete={() => setPaymentComplete(true)}
        />
      </CheckoutProvider>
    </>
  );
};
