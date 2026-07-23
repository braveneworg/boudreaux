/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout';
import { loadStripe } from '@stripe/stripe-js';
import { CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import { preconnect } from 'react-dom';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { usePurchaseStatusQuery } from '@/hooks/queries/use-purchase-status-query';
import { createPurchaseCheckoutSessionAction } from '@/lib/actions/create-purchase-checkout-session-action';
import { createPurchaseSessionAction } from '@/lib/actions/create-purchase-session-action';
import { ALREADY_PURCHASED_ERROR } from '@/lib/constants';

let stripePromise: ReturnType<typeof loadStripe> | null = null;
const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');
  }
  return stripePromise;
};

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_COUNT = 30;

const SESSION_ERROR_MESSAGES = new Map<string, string>([
  ['already_purchased', ALREADY_PURCHASED_ERROR],
  ['amount_below_minimum', 'The minimum purchase amount is $0.50.'],
  ['release_unavailable', 'This release is no longer available for purchase.'],
  ['stripe_error', 'A payment error occurred. Please try again or contact support.'],
]);

/**
 * Maps a machine-readable error code returned by the server action to a
 * human-friendly message suitable for display.
 */
const getSessionErrorMessage = (code: string): string =>
  SESSION_ERROR_MESSAGES.get(code) ?? 'Something went wrong. Please try again.';

interface PurchaseCheckoutStepProps {
  releaseId: string;
  releaseTitle: string;
  amountCents: number;
  customerEmail?: string | null;
  onConfirmed: () => void;
  onError: (message: string) => void;
  onCancel: () => void;
}

/** Formats an integer cent amount to a USD display string, e.g. 500 → "$5.00". */
const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

interface PurchaseCheckoutFormProps {
  amountCents: number;
  onPaymentComplete: () => void;
  onCancel: () => void;
}

const PurchaseCheckoutForm = ({
  amountCents,
  onPaymentComplete,
  onCancel,
}: PurchaseCheckoutFormProps) => {
  const checkoutState = useCheckout();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);

  const handlePaymentChange = useCallback((event: { complete: boolean }) => {
    setPaymentComplete(event.complete);
  }, []);

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
        <Loader2Icon className="size-8 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return <p className="text-destructive text-sm">{checkoutState.error.message}</p>;
  }

  const canSubmit = checkoutState.checkout.canConfirm || paymentComplete;

  return (
    <div className="space-y-4">
      <PaymentElement onChange={handlePaymentChange} />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button className="w-full" onClick={handleConfirm} disabled={!canSubmit || isConfirming}>
        {isConfirming ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay ${formatCents(amountCents)}`
        )}
      </Button>

      <Button variant="destructive" className="w-full" onClick={onCancel} disabled={isConfirming}>
        Cancel
      </Button>
    </div>
  );
};

/**
 * Terminal step for a confirmed guest purchase that now requires magic-link
 * verification before download (#665) — no session was auto-minted.
 */
const PurchaseVerificationStep = ({ customerEmail }: { customerEmail?: string | null }) => (
  <>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <CheckCircle2Icon className="size-5 text-green-500" />
        Payment received!
      </DialogTitle>
      <DialogDescription>
        Your payment was received. Check your email
        {customerEmail ? ` (${customerEmail})` : ''} to sign in and download your purchase.
      </DialogDescription>
    </DialogHeader>
  </>
);

/** In-flight step shown after payment while the webhook confirmation is polled. */
const PurchasePendingStep = ({
  timedOut,
  isLoggingIn,
}: {
  timedOut: boolean;
  isLoggingIn: boolean;
}) => (
  <>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <CheckCircle2Icon className="size-5 text-green-500" />
        Payment received!
      </DialogTitle>
      <DialogDescription>
        {timedOut ? (
          <>
            This is taking longer than expected. Your payment was received &mdash; please check your
            email for a download link or contact{' '}
            <a href="mailto:support@fakefourinc.com" className="underline">
              support@fakefourinc.com
            </a>
          </>
        ) : isLoggingIn ? (
          'Setting up your account...'
        ) : (
          'Confirming your purchase...'
        )}
      </DialogDescription>
    </DialogHeader>

    {!timedOut && (
      <div className="flex items-center justify-center py-6" role="status">
        <Loader2Icon className="size-6 animate-spin text-zinc-950" />
      </div>
    )}
  </>
);

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
  customerEmail,
  onConfirmed,
  onError,
  onCancel,
}: PurchaseCheckoutStepProps) => {
  // Warm the Stripe origin the moment the checkout step renders — the
  // js.stripe.com script and PaymentElement iframe follow within this render
  // cycle. Replaces the global dns-prefetch that shipped on every page.
  preconnect('https://js.stripe.com');

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [pollLimitReached, setPollLimitReached] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const createSession = async () => {
      try {
        const result = await createPurchaseCheckoutSessionAction({
          releaseId,
          amountCents,
          ...(customerEmail ? { customerEmail } : {}),
        });

        if (cancelled) return;

        if (!result.success) {
          const message = getSessionErrorMessage(result.error);
          setSessionError(message);
          onError(message);
          return;
        }

        setClientSecret(result.clientSecret);
        setSessionId(result.sessionId);
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
  }, [releaseId, releaseTitle, amountCents, customerEmail, onError]);

  // Poll count is read from TanStack Query's own `query.state.dataUpdateCount`
  // inside `refetchInterval` (which stops polling at the cap), rather than a
  // counter mutated inside `queryFn` — a `queryFn` side effect the query
  // exhaustive-deps rule rightly flags. Reaching the cap latches
  // `pollLimitReached` so the render can show the timeout UI.
  const { data: purchaseStatus } = usePurchaseStatusQuery(releaseId, sessionId, {
    enabled: paymentComplete,
    refetchInterval: (query) => {
      if (query.state.data?.confirmed) return false;
      if (query.state.dataUpdateCount >= MAX_POLL_COUNT) {
        setPollLimitReached(true);
        return false;
      }
      return POLL_INTERVAL_MS;
    },
    retry: false,
  });

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);

  useEffect(() => {
    if (!purchaseStatus?.confirmed || !sessionId) return;

    let cancelled = false;

    const loginAndConfirm = async () => {
      setIsLoggingIn(true);
      try {
        const result = await createPurchaseSessionAction({ sessionId });
        // A guest purchase no longer auto-logs-in (#665): the server sent a
        // magic link, so keep the buyer on this step with the "check your
        // email" prompt instead of advancing to the download step.
        if (!cancelled && result.verificationRequired) {
          setVerificationRequired(true);
          return;
        }
      } catch {
        // Best-effort — an already-authenticated buyer proceeds; a guest whose
        // send failed can still sign in manually via magic link.
      }
      if (!cancelled) {
        onConfirmed();
      }
    };

    loginAndConfirm();

    return () => {
      cancelled = true;
    };
  }, [purchaseStatus, sessionId, onConfirmed]);

  const timedOut = paymentComplete && pollLimitReached && !purchaseStatus?.confirmed;

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
          <Loader2Icon className="size-8 animate-spin text-zinc-950" />
        </div>
      </>
    );
  }

  // #665: a confirmed guest purchase requires magic-link verification — no
  // session was minted, so surface the "check your email" prompt instead of
  // advancing to the download step. Terminal state; takes priority over the
  // in-flight paymentComplete UI.
  if (verificationRequired) {
    return <PurchaseVerificationStep customerEmail={customerEmail} />;
  }

  if (paymentComplete) {
    return <PurchasePendingStep timedOut={timedOut} isLoggingIn={isLoggingIn} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Purchase {releaseTitle}</DialogTitle>
        <DialogDescription>You are paying {formatCents(amountCents)}</DialogDescription>
      </DialogHeader>
      <CheckoutElementsProvider stripe={getStripe()} options={{ clientSecret }}>
        <PurchaseCheckoutForm
          amountCents={amountCents}
          onPaymentComplete={() => setPaymentComplete(true)}
          onCancel={onCancel}
        />
      </CheckoutElementsProvider>
    </>
  );
};
