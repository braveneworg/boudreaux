/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { SmsBlastService } from '@/lib/services/sms-blast-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { sendSmsBlastAction } from './send-sms-blast-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/services/sms-blast-service', () => ({
  SmsBlastService: {
    sendBlast: vi.fn(),
  },
}));
vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

const mockRateLimitCheck = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: mockRateLimitCheck,
  })),
}));

const mockSession = {
  user: {
    id: 'user-admin-1',
    email: 'admin@test.com',
    role: 'admin',
  },
};

const validMessage = 'Hello subscribers, we have a new release!';

describe('sendSmsBlastAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRateLimitCheck.mockResolvedValue(undefined);
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    vi.mocked(SmsBlastService.sendBlast).mockResolvedValue({
      success: true,
      data: { blastId: 'blast-abc', recipientCount: 100, sentCount: 98, failedCount: 2 },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authorization', () => {
    it('returns Unauthorized when requireRole throws', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      const result = await sendSmsBlastAction({ message: validMessage });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
      expect(SmsBlastService.sendBlast).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('returns schema error for empty message', async () => {
      const result = await sendSmsBlastAction({ message: '' });

      expect(result).toEqual({ success: false, error: 'Message cannot be empty' });
      expect(SmsBlastService.sendBlast).not.toHaveBeenCalled();
    });

    it('returns schema error for 321-char message', async () => {
      const result = await sendSmsBlastAction({ message: 'a'.repeat(321) });

      expect(result).toEqual({
        success: false,
        error: 'Message must be 320 characters or fewer',
      });
      expect(SmsBlastService.sendBlast).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('blocks on the 4th call; service called exactly 3 times', async () => {
      for (let i = 0; i < 3; i++) {
        await sendSmsBlastAction({ message: validMessage });
      }
      mockRateLimitCheck.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const result = await sendSmsBlastAction({ message: validMessage });

      expect(result).toEqual({
        success: false,
        error: 'Rate limit exceeded — try again later',
      });
      expect(SmsBlastService.sendBlast).toHaveBeenCalledTimes(3);
    });

    it('bypasses rate limit when E2E_MODE is true', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      mockRateLimitCheck.mockRejectedValue(new Error('Rate limit exceeded'));

      const result = await sendSmsBlastAction({ message: validMessage });

      expect(result).toEqual({
        success: true,
        recipientCount: 100,
        sentCount: 98,
        failedCount: 2,
      });
      expect(mockRateLimitCheck).not.toHaveBeenCalled();
    });
  });

  describe('service failures', () => {
    it('passes through service error; skips audit and revalidate', async () => {
      vi.mocked(SmsBlastService.sendBlast).mockResolvedValue({
        success: false,
        error: 'No opted-in SMS subscribers',
      } as never);

      const result = await sendSmsBlastAction({ message: validMessage });

      expect(result).toEqual({ success: false, error: 'No opted-in SMS subscribers' });
      expect(vi.mocked(logSecurityEvent)).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('returns counts, audit-logs the event, and revalidates', async () => {
      const result = await sendSmsBlastAction({ message: validMessage });

      expect(result).toEqual({ success: true, recipientCount: 100, sentCount: 98, failedCount: 2 });
      expect(SmsBlastService.sendBlast).toHaveBeenCalledWith({
        message: validMessage,
        sentById: 'user-admin-1',
        sentByEmail: 'admin@test.com',
      });
      expect(vi.mocked(logSecurityEvent)).toHaveBeenCalledWith({
        event: 'notification.sms.blast.sent',
        userId: 'user-admin-1',
        metadata: {
          blastId: 'blast-abc',
          recipientCount: 100,
          sentCount: 98,
          failedCount: 2,
        },
      });
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/admin/announcements');
    });
  });
});
