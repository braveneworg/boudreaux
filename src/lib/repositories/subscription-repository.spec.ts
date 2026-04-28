/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SubscriptionRepository } from './subscription-repository';

vi.mock('server-only', () => ({}));

const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUpdate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

describe('SubscriptionRepository', () => {
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
    it('should find user by stripeCustomerId then update by id', async () => {
      const data = {
        subscriptionId: 'sub_123',
        subscriptionStatus: 'active' as const,
        subscriptionTier: 'minimum',
        subscriptionCurrentPeriodEnd: new Date('2026-04-17'),
      };
      mockFindFirst.mockResolvedValue({ id: '1' });
      mockUpdate.mockResolvedValue({ id: '1', ...data });

      await SubscriptionRepository.updateSubscription('cus_123', data);

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        select: { id: true },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          subscriptionId: 'sub_123',
          subscriptionStatus: 'active',
          subscriptionTier: 'minimum',
          subscriptionCurrentPeriodEnd: new Date('2026-04-17'),
        },
      });
    });

    it('should throw if no user found', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        SubscriptionRepository.updateSubscription('cus_missing', {
          subscriptionId: 'sub_123',
          subscriptionStatus: 'active' as const,
          subscriptionTier: 'minimum',
          subscriptionCurrentPeriodEnd: new Date(),
        })
      ).rejects.toThrow('No user found with stripeCustomerId: cus_missing');
    });
  });

  describe('cancelSubscription', () => {
    it('should find user then set status to canceled and null other fields', async () => {
      mockFindFirst.mockResolvedValue({ id: '1' });
      mockUpdate.mockResolvedValue({ id: '1', subscriptionStatus: 'canceled' });

      await SubscriptionRepository.cancelSubscription('cus_123');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        select: { id: true },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          subscriptionStatus: 'canceled',
          subscriptionId: null,
          subscriptionTier: null,
          subscriptionCurrentPeriodEnd: null,
          confirmationEmailSentAt: null,
        },
      });
    });

    it('should throw if no user found', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(SubscriptionRepository.cancelSubscription('cus_missing')).rejects.toThrow(
        'No user found with stripeCustomerId: cus_missing'
      );
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should find user then update only the subscription status', async () => {
      mockFindFirst.mockResolvedValue({ id: '1' });
      mockUpdate.mockResolvedValue({ id: '1', subscriptionStatus: 'past_due' });

      await SubscriptionRepository.updateSubscriptionStatus('cus_123', 'past_due');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        select: { id: true },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { subscriptionStatus: 'past_due' },
      });
    });

    it('should throw if no user found', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        SubscriptionRepository.updateSubscriptionStatus('cus_missing', 'past_due')
      ).rejects.toThrow('No user found with stripeCustomerId: cus_missing');
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should find user by stripeCustomerId with subscription fields', async () => {
      mockFindFirst.mockResolvedValue({ id: '1', email: 'test@example.com' });

      await SubscriptionRepository.findByStripeCustomerId('cus_123');

      expect(mockFindFirst).toHaveBeenCalledWith({
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

  describe('resetConfirmationEmailSent', () => {
    it('should clear confirmationEmailSentAt for the given email', async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      await SubscriptionRepository.resetConfirmationEmailSent('test@example.com');

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: { confirmationEmailSentAt: null },
      });
    });
  });

  describe('hasActiveSubscription', () => {
    it('should query for the user id with subscriptionStatus in [active, trialing]', async () => {
      mockFindFirst.mockResolvedValue({ id: 'user-1' });

      await SubscriptionRepository.hasActiveSubscription('user-1');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          subscriptionStatus: { in: ['active', 'trialing'] },
        },
        select: { id: true },
      });
    });

    it('should return true when an active subscriber row exists', async () => {
      mockFindFirst.mockResolvedValue({ id: 'user-1' });

      const result = await SubscriptionRepository.hasActiveSubscription('user-1');

      expect(result).toBe(true);
    });

    it('should return false when no matching user is found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await SubscriptionRepository.hasActiveSubscription('user-1');

      expect(result).toBe(false);
    });
  });
});
