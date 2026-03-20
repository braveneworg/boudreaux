/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { stripe } from '@/lib/stripe';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Subscription Confirmed | Fake Four Inc.',
  description: 'Thank you for subscribing to the Fake Four Inc. record label.',
};

interface SubscribeSuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

/**
 * Masks a customer email to reduce PII exposure on the confirmation page.
 * Example: "subscriber@example.com" → "s***@example.com"
 */
const maskEmail = (email: string): string => {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return email;
  return `${email[0]}***${email.slice(atIndex)}`;
};

const SubscribeSuccessPage = async ({ searchParams }: SubscribeSuccessPageProps) => {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Subscribe</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          It looks like you arrived here without completing checkout.
        </p>
      </div>
    );
  }

  if (!session_id.startsWith('cs_')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Something Went Wrong</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          We could not verify your subscription. Please contact support if you believe this is an
          error.
        </p>
      </div>
    );
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

    if (checkoutSession.payment_status === 'paid') {
      const customerEmail = checkoutSession.customer_details?.email;

      return (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to the Family!</h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Thank you for subscribing! You now have access to all music on the Fake Four Inc. record
            label.
          </p>
          {customerEmail && (
            <p className="text-muted-foreground mt-2 text-sm">
              A confirmation email will be sent to {maskEmail(customerEmail)}.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Processing Your Subscription</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Your payment is being processed. You will receive a confirmation email shortly.
        </p>
      </div>
    );
  } catch {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Something Went Wrong</h1>
        <p className="text-muted-foreground mt-4 text-lg">
          We could not verify your subscription. Please contact support if you believe this is an
          error.
        </p>
      </div>
    );
  }
};

export default SubscribeSuccessPage;
