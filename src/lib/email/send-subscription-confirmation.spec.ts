/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { sendSubscriptionConfirmationEmail } from './send-subscription-confirmation';

vi.mock('server-only', () => ({}));

const mockMarkConfirmationEmailSent = vi.fn();
const mockResetConfirmationEmailSent = vi.fn();

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    markConfirmationEmailSent: (...args: unknown[]) => mockMarkConfirmationEmailSent(...args),
    resetConfirmationEmailSent: (...args: unknown[]) => mockResetConfirmationEmailSent(...args),
  },
}));

vi.mock('@/lib/subscriber-rates', () => ({
  TIER_LABELS: {
    minimum: 'Minimum',
    extra: 'Extra',
    extraExtra: 'Extra Extra',
  },
  getSubscriberRate: (tier: string) => {
    const rates: Record<string, number> = {
      minimum: 14.44,
      extra: 24.44,
      extraExtra: 44.44,
    };
    return rates[tier] ?? 0;
  },
}));

const mockSesSend = vi.fn();

vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: (...args: unknown[]) => mockSesSend(...args) },
}));

vi.mock('./subscription-confirmation-email-html', () => ({
  buildSubscriptionConfirmationEmailHtml: () => '<html>confirmation</html>',
}));

vi.mock('./subscription-confirmation-email-text', () => ({
  buildSubscriptionConfirmationEmailText: () => 'confirmation text',
}));

describe('sendSubscriptionConfirmationEmail', () => {
  beforeEach(() => {
    mockMarkConfirmationEmailSent.mockResolvedValue(true);
    mockSesSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should send confirmation email and return true', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');

    const result = await sendSubscriptionConfirmationEmail('test@example.com', 'minimum', 'month');

    expect(result).toBe(true);
    expect(mockMarkConfirmationEmailSent).toHaveBeenCalledWith('test@example.com');
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it('should return false when EMAIL_FROM is not configured', async () => {
    vi.stubEnv('EMAIL_FROM', '');

    const result = await sendSubscriptionConfirmationEmail('test@example.com', 'minimum', 'month');

    expect(result).toBe(false);
    expect(mockMarkConfirmationEmailSent).not.toHaveBeenCalled();
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('should return false when confirmation was already sent', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockMarkConfirmationEmailSent.mockResolvedValue(false);

    const result = await sendSubscriptionConfirmationEmail('test@example.com', 'minimum', 'month');

    expect(result).toBe(false);
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('should reset flag and return false when SES send fails', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockSesSend.mockRejectedValue(new Error('SES error'));

    const result = await sendSubscriptionConfirmationEmail('test@example.com', 'minimum', 'month');

    expect(result).toBe(false);
    expect(mockResetConfirmationEmailSent).toHaveBeenCalledWith('test@example.com');
  });

  it('should send with default tier label when tier is null', async () => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');

    const result = await sendSubscriptionConfirmationEmail('test@example.com', null, 'month');

    expect(result).toBe(true);
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});
