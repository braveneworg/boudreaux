/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));

const { constructorCalls } = vi.hoisted(() => {
  const constructorCalls: unknown[][] = [];
  return { constructorCalls };
});

vi.mock('stripe', () => {
  return {
    default: class FakeStripe {
      customers = { create: vi.fn() };
      checkout = { sessions: { create: vi.fn() } };
      apiVersion = '2025-04-30.basil';
      constructor(...args: unknown[]) {
        constructorCalls.push(args);
      }
    },
  };
});

describe('Stripe client caching behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // Clean up the global cache between tests
    delete (globalThis as Record<string, unknown>).stripe;
  });

  it('should cache Stripe client in production', async () => {
    vi.resetModules();
    constructorCalls.length = 0;
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_production_key');

    const { stripe } = await import('./stripe');

    // First property access — triggers getStripe() and creates a new client
    void stripe.customers;
    // Second property access — should return the cached client
    void stripe.checkout;

    expect(constructorCalls).toHaveLength(1);
  });

  it('should also cache Stripe client in development', async () => {
    vi.resetModules();
    constructorCalls.length = 0;
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_development_key');

    const { stripe } = await import('./stripe');

    // First property access — triggers getStripe() and creates a new client
    void stripe.customers;
    // Second property access — should return the cached client
    void stripe.checkout;

    expect(constructorCalls).toHaveLength(1);
  });

  it('should throw when STRIPE_SECRET_KEY is not set', async () => {
    vi.resetModules();
    constructorCalls.length = 0;
    delete process.env.STRIPE_SECRET_KEY;

    const { stripe } = await import('./stripe');

    expect(() => void stripe.customers).toThrow(
      'STRIPE_SECRET_KEY environment variable is not set'
    );
  });

  it('should return non-function properties without binding', async () => {
    vi.resetModules();
    constructorCalls.length = 0;
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_prop_key');

    const { stripe } = await import('./stripe');

    // Access a scalar property (not a function) — should be returned as-is
    const version = (stripe as unknown as Record<string, unknown>).apiVersion;
    expect(version).toBe('2025-04-30.basil');
  });
});
