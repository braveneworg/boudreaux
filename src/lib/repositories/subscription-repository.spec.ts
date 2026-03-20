/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SubscriptionRepository } from './subscription-repository';

vi.mock('server-only', () => ({}));

const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

describe('SubscriptionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linkStripeCustomer', () => {
    it('should update user with stripeCustomerId by email', async () => {
      mockUpdate.mockResolvedValue({ id: '1', stripeCustomerId: 'cus_123' });

      await SubscriptionRepository.linkStripeCustomer('test@example.com', 'cus_123');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: { stripeCustomerId: 'cus_123' },
      });
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription fields by stripeCustomerId', async () => {
      const data = {
        subscriptionId: 'sub_123',
        subscriptionStatus: 'active',
        subscriptionTier: 'minimum',
        subscriptionCurrentPeriodEnd: new Date('2026-04-17'),
      };
      mockUpdate.mockResolvedValue({ id: '1', ...data });

      await SubscriptionRepository.updateSubscription('cus_123', data);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: {
          subscriptionId: 'sub_123',
          subscriptionStatus: 'active',
          subscriptionTier: 'minimum',
          subscriptionCurrentPeriodEnd: new Date('2026-04-17'),
        },
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should set status to canceled and null other fields', async () => {
      mockUpdate.mockResolvedValue({ id: '1', subscriptionStatus: 'canceled' });

      await SubscriptionRepository.cancelSubscription('cus_123');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: {
          subscriptionStatus: 'canceled',
          subscriptionId: null,
          subscriptionTier: null,
          subscriptionCurrentPeriodEnd: null,
          confirmationEmailSentAt: null,
        },
      });
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should update only the subscription status', async () => {
      mockUpdate.mockResolvedValue({ id: '1', subscriptionStatus: 'past_due' });

      await SubscriptionRepository.updateSubscriptionStatus('cus_123', 'past_due');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: { subscriptionStatus: 'past_due' },
      });
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should find user by stripeCustomerId with subscription fields', async () => {
      mockFindUnique.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await SubscriptionRepository.findByStripeCustomerId('cus_123');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        select: expect.objectContaining({
          id: true,
          email: true,
          stripeCustomerId: true,
          subscriptionId: true,
          subscriptionStatus: true,
          subscriptionTier: true,
          subscriptionCurrentPeriodEnd: true,
          confirmationEmailSentAt: true,
        }),
      });
    });
  });

  describe('findByEmail', () => {
    it('should find user by email with subscription fields', async () => {
      mockFindUnique.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await SubscriptionRepository.findByEmail('test@example.com');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.objectContaining({
          id: true,
          email: true,
          stripeCustomerId: true,
          subscriptionId: true,
          subscriptionStatus: true,
          subscriptionTier: true,
          subscriptionCurrentPeriodEnd: true,
          confirmationEmailSentAt: true,
        }),
      });
    });
  });

  describe('markConfirmationEmailSent', () => {
    it('should return true when email was not previously sent', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await SubscriptionRepository.markConfirmationEmailSent('test@example.com');

      expect(result).toBe(true);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { email: 'test@example.com', confirmationEmailSentAt: null },
        data: { confirmationEmailSentAt: expect.any(Date) },
      });
    });

    it('should return false when email was already sent', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const result = await SubscriptionRepository.markConfirmationEmailSent('test@example.com');

      expect(result).toBe(false);
    });
  });
});
