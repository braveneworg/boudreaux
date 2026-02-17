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
  },
}));

describe('ses-client', () => {
  it('should create an SESClient with the configured region', async () => {
    const { sesClient } = await import('@/lib/utils/ses-client');

    expect(sesClient).toBeDefined();
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
});
