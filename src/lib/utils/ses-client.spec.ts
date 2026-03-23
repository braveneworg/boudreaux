/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Use a class-based mock to properly handle `new SESClient()`
const constructorSpy = vi.fn();

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: class MockSESClient {
    constructor(config: Record<string, string>) {
      constructorSpy(config);
    }
    send() {
      return 'mock-send';
    }
  },
}));

describe('ses-client', () => {
  it('should create an SESClient with the configured region on first access', async () => {
    const { sesClient } = await import('@/lib/utils/ses-client');

    expect(sesClient).toBeDefined();

    // The Proxy defers instantiation until the first property access
    void sesClient.config;

    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        region: expect.any(String),
      })
    );
  });

  it('should export a sesClient instance', async () => {
    const { sesClient } = await import('@/lib/utils/ses-client');

    expect(sesClient).toBeDefined();
    expect(sesClient).toBeInstanceOf(Object);
  });

  it('should bind function properties to the client instance', async () => {
    const { sesClient } = await import('@/lib/utils/ses-client');

    // Accessing a method on the proxy should return a bound function
    expect(typeof sesClient.send).toBe('function');
  });

  it('should use AWS_REGION from environment when set', async () => {
    vi.stubEnv('AWS_REGION', 'eu-west-1');
    constructorSpy.mockClear();

    const { sesClient } = await import('@/lib/utils/ses-client');

    // Force a fresh client creation through the proxy
    void sesClient.config;

    expect(constructorSpy).toHaveBeenCalledWith({ region: 'eu-west-1' });
    vi.unstubAllEnvs();
  });

  it('should fall back to us-east-1 when AWS_REGION is not set', async () => {
    vi.unstubAllEnvs();
    delete process.env.AWS_REGION;
    constructorSpy.mockClear();

    const { sesClient } = await import('@/lib/utils/ses-client');

    void sesClient.config;

    expect(constructorSpy).toHaveBeenCalledWith({ region: 'us-east-1' });
  });
});
