/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { handleCheckoutSessionCompleted } from './checkout-session-completed.js';

import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockPurchaseFindUnique = vi.fn();
const mockPurchaseFindFirst = vi.fn();
const mockPurchaseCreate = vi.fn();
const mockPurchaseUpdate = vi.fn();
const mockReleaseFindFirst = vi.fn();
const mockSessionsRetrieve = vi.fn();
const mockSendPurchaseConfirmationEmail = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  getPrisma: () => ({
    user: {
      create: (...args: unknown[]) => mockUserCreate(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    releasePurchase: {
      findUnique: (...args: unknown[]) => mockPurchaseFindUnique(...args),
      findFirst: (...args: unknown[]) => mockPurchaseFindFirst(...args),
      create: (...args: unknown[]) => mockPurchaseCreate(...args),
      update: (...args: unknown[]) => mockPurchaseUpdate(...args),
    },
    release: {
      findFirst: (...args: unknown[]) => mockReleaseFindFirst(...args),
    },
  }),
}));

vi.mock('../lib/stripe.js', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockSessionsRetrieve(...args),
      },
    },
  }),
}));

vi.mock('../email/send-purchase-confirmation.js', () => ({
  sendPurchaseConfirmationEmail: (...args: unknown[]) => mockSendPurchaseConfirmationEmail(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RELEASE_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const USER_ID = 'f6e5d4c3b2a1f6e5d4c3b2a1';
const GUEST_EMAIL = 'guest@example.com';

const makeSession = (): Stripe.Checkout.Session =>
  ({
    id: 'cs_test_1',
    mode: 'payment',
    metadata: { type: 'release_purchase', releaseId: RELEASE_ID },
  }) as unknown as Stripe.Checkout.Session;

const makeRetrievedSession = (): Stripe.Checkout.Session =>
  ({
    id: 'cs_test_1',
    mode: 'payment',
    metadata: { type: 'release_purchase', releaseId: RELEASE_ID },
    customer_details: { email: GUEST_EMAIL },
    payment_intent: 'pi_test_1',
    amount_total: 500,
    currency: 'usd',
  }) as unknown as Stripe.Checkout.Session;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleCheckoutSessionCompleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionsRetrieve.mockResolvedValue(makeRetrievedSession());
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: USER_ID });
    mockPurchaseFindUnique.mockResolvedValue(null);
    mockPurchaseFindFirst.mockResolvedValue(null);
    mockPurchaseCreate.mockResolvedValue({ id: 'purchase-1' });
    mockReleaseFindFirst.mockResolvedValue({ title: 'Test Release' });
    mockSendPurchaseConfirmationEmail.mockResolvedValue(true);
  });

  it('creates a guest user with a boolean emailVerified flag', async () => {
    await handleCheckoutSessionCompleted(makeSession());

    // The schema's better-auth migration turned emailVerified into a Boolean;
    // a Date here is rejected by the generated client at runtime.
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        email: GUEST_EMAIL,
        emailVerified: true,
        username: expect.any(String),
      },
    });
  });

  it('records the purchase against the newly created guest user', async () => {
    await handleCheckoutSessionCompleted(makeSession());

    expect(mockPurchaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, releaseId: RELEASE_ID }),
    });
  });
});
