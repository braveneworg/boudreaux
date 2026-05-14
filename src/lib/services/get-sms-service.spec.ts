/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));

vi.mock('./noop-sms-service', () => {
  class NoOpSmsService {
    type = 'noop';
  }
  return { NoOpSmsService };
});

vi.mock('./sns-sms-service', () => ({
  buildSnsSmsServiceFromEnv: vi.fn(() => ({ type: 'sns' })),
}));

describe('getSmsService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the no-op provider when SMS_PROVIDER is unset', async () => {
    delete process.env.SMS_PROVIDER;
    const { getSmsService, resetSmsServiceForTesting } = await import('./get-sms-service');
    resetSmsServiceForTesting();
    const service = getSmsService();
    expect((service as unknown as { type: string }).type).toBe('noop');
  });

  it('returns the SNS provider when SMS_PROVIDER=sns', async () => {
    vi.stubEnv('SMS_PROVIDER', 'sns');
    const { getSmsService, resetSmsServiceForTesting } = await import('./get-sms-service');
    resetSmsServiceForTesting();
    const service = getSmsService();
    expect((service as unknown as { type: string }).type).toBe('sns');
  });

  it('caches the resolved instance across calls', async () => {
    const { getSmsService, resetSmsServiceForTesting } = await import('./get-sms-service');
    resetSmsServiceForTesting();
    const first = getSmsService();
    const second = getSmsService();
    expect(first).toBe(second);
  });

  it('allows tests to inject an override', async () => {
    const { getSmsService, resetSmsServiceForTesting } = await import('./get-sms-service');
    const override = { type: 'mock' } as never;
    resetSmsServiceForTesting(override);
    expect(getSmsService()).toBe(override);
  });
});
