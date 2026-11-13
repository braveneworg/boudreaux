/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { headers } from 'next/headers';

import { auth } from '@/auth';
import { mayUseCommunity } from '@/lib/community/community-access';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import { SubmissionRuleError } from '@/lib/services/submission-service';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';

import { fileSubmissionReportAction } from './file-submission-report-action';

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/community/community-access', () => ({ mayUseCommunity: vi.fn() }));
vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));
vi.mock('@/lib/services/submission-report-service', () => ({
  SubmissionReportService: { file: vi.fn() },
}));
vi.mock('@/lib/services/submission-service', async () => {
  const { DataError: BaseError } = await import('@/lib/types/domain/errors');

  // The same shape as the real rule error. The action helpers import it from
  // this mock too, so `instanceof` holds on both sides.
  class SubmissionRuleError extends BaseError {
    constructor(
      code: DataErrorCode,
      message: string,
      public readonly field?: string
    ) {
      super(code, message);
    }
  }

  return { SubmissionRuleError };
});

const USER_ID = 'a'.repeat(24);
const SUBMISSION_ID = '507f1f77bcf86cd799439011';
const SENT = { success: true, data: { sent: true } };
const FORBIDDEN = { success: false, error: 'Unauthorized', code: 'FORBIDDEN' };

const REQUEST_HEADERS = {
  'x-forwarded-for': '203.0.113.9',
  'user-agent': 'Zine Browser 1.0',
  'accept-language': 'en-US',
};

const form = {
  submissionId: SUBMISSION_ID,
  reason: 'NOT_THEIRS',
  note: '  That is my photo.  ',
  contactEmail: ' Wronged@Example.com ',
  turnstileToken: 'token',
};

const report = {
  submissionId: SUBMISSION_ID,
  reason: 'NOT_THEIRS',
  note: 'That is my photo.',
  contactEmail: 'wronged@example.com',
};

const guestKey = `guest:${computeFingerprintHash({
  userAgent: 'Zine Browser 1.0',
  acceptLanguage: 'en-US',
  ip: '203.0.113.9',
})}`;

const signedOut = (): void => {
  vi.mocked(auth).mockResolvedValueOnce(null);
};

const signedIn = (overrides: { role?: string; banned?: boolean } = {}): void => {
  vi.mocked(auth).mockResolvedValueOnce({
    user: { id: USER_ID, role: 'user', banned: false, ...overrides },
  } as never);
};

/** The community is open to this caller and their verification passes. */
const openAndVerified = (): void => {
  vi.mocked(mayUseCommunity).mockReturnValueOnce(true);
  vi.mocked(verifyTurnstile).mockResolvedValueOnce({ success: true });
};

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(mayUseCommunity).mockReset();
  vi.mocked(verifyTurnstile).mockReset();
  vi.mocked(SubmissionReportService.file).mockReset();
  vi.mocked(headers).mockReset();
  vi.mocked(headers).mockResolvedValue(new Headers(REQUEST_HEADERS) as never);
});

describe('fileSubmissionReportAction', () => {
  describe('who may call it', () => {
    it('files a report for a signed-out visitor once the community is open to them', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({ stored: false });

      await expect(fileSubmissionReportAction(form)).resolves.toEqual(SENT);
      expect(vi.mocked(mayUseCommunity).mock.calls).toEqual([[undefined]]);
    });

    it('refuses a signed-out visitor while the community is closed to them', async () => {
      signedOut();
      vi.mocked(mayUseCommunity).mockReturnValueOnce(false);

      await expect(fileSubmissionReportAction(form)).resolves.toEqual(FORBIDDEN);
      expect(SubmissionReportService.file).not.toHaveBeenCalled();
    });

    it('asks whether the community is open to a signed-in caller by their role', async () => {
      signedIn({ role: 'manager' });
      vi.mocked(mayUseCommunity).mockReturnValueOnce(false);

      await expect(fileSubmissionReportAction(form)).resolves.toEqual(FORBIDDEN);
      expect(vi.mocked(mayUseCommunity).mock.calls).toEqual([['manager']]);
    });

    it('refuses a banned account before anything else is asked', async () => {
      signedIn({ role: 'admin', banned: true });

      await expect(fileSubmissionReportAction(form)).resolves.toEqual({
        success: false,
        error: 'Account suspended',
        code: 'BANNED',
      });
      expect(mayUseCommunity).not.toHaveBeenCalled();
      expect(verifyTurnstile).not.toHaveBeenCalled();
    });

    it('does not verify a token for a caller it is about to refuse', async () => {
      signedOut();
      vi.mocked(mayUseCommunity).mockReturnValueOnce(false);

      await fileSubmissionReportAction(form);

      expect(verifyTurnstile).not.toHaveBeenCalled();
    });
  });

  describe('what it accepts', () => {
    it('refuses a malformed report on its fields, before verifying anything', async () => {
      signedOut();
      vi.mocked(mayUseCommunity).mockReturnValueOnce(true);

      const result = await fileSubmissionReportAction({
        ...form,
        reason: 'SPAM',
        contactEmail: 'nope',
      });

      expect(result).toMatchObject({ success: false, code: 'INVALID_INPUT' });
      expect(Object.keys((result as { fieldErrors: object }).fieldErrors).sort()).toEqual([
        'contactEmail',
        'reason',
      ]);
      expect(verifyTurnstile).not.toHaveBeenCalled();
      expect(SubmissionReportService.file).not.toHaveBeenCalled();
    });

    it('verifies the token against the caller’s address', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({ stored: false });

      await fileSubmissionReportAction(form);

      expect(vi.mocked(verifyTurnstile).mock.calls).toEqual([['token', '203.0.113.9']]);
    });

    it('refuses a report whose verification fails, and files nothing', async () => {
      signedOut();
      vi.mocked(mayUseCommunity).mockReturnValueOnce(true);
      vi.mocked(verifyTurnstile).mockResolvedValueOnce({
        success: false,
        error: 'Invalid verification. Please try again.',
      });

      await expect(fileSubmissionReportAction(form)).resolves.toEqual({
        success: false,
        error: 'Invalid verification. Please try again.',
        code: 'INVALID_INPUT',
        fieldErrors: { turnstileToken: ['Invalid verification. Please try again.'] },
      });
      expect(SubmissionReportService.file).not.toHaveBeenCalled();
    });
  });

  describe('what it files', () => {
    it('files the trimmed report without the token', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({ stored: false });

      await fileSubmissionReportAction(form);

      expect(vi.mocked(SubmissionReportService.file).mock.calls[0]?.[0]).toEqual(report);
    });

    it('keys a guest’s limits by their visitor fingerprint', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({ stored: false });

      await fileSubmissionReportAction(form);

      expect(vi.mocked(SubmissionReportService.file).mock.calls[0]?.[1]).toBe(guestKey);
    });

    it('keys a signed-in reporter’s limits by their account', async () => {
      signedIn();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({ stored: false });

      await fileSubmissionReportAction(form);

      expect(vi.mocked(SubmissionReportService.file).mock.calls[0]?.[1]).toBe(`user:${USER_ID}`);
    });

    it('answers the same whether or not the report was stored', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockResolvedValueOnce({
        stored: true,
        report: { id: 'e'.repeat(24) } as never,
      });

      await expect(fileSubmissionReportAction(form)).resolves.toEqual(SENT);
    });

    it('hands a limit’s refusal back with its message', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockRejectedValueOnce(
        new SubmissionRuleError('LIMIT_EXCEEDED', 'You have already reported this submission.')
      );

      await expect(fileSubmissionReportAction(form)).resolves.toEqual({
        success: false,
        error: 'You have already reported this submission.',
        code: 'LIMIT_EXCEEDED',
      });
    });

    it('hides an unexpected failure behind its own message', async () => {
      signedOut();
      openAndVerified();
      vi.mocked(SubmissionReportService.file).mockRejectedValueOnce(
        new Error('E11000 duplicate key in submissionReport')
      );

      await expect(fileSubmissionReportAction(form)).resolves.toEqual({
        success: false,
        error: 'We could not send your report. Please try again.',
        code: 'UNKNOWN',
      });
    });
  });
});
