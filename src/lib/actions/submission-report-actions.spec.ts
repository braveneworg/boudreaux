/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import { SubmissionRuleError } from '@/lib/services/submission-service';
import type { DataErrorCode } from '@/lib/types/domain/errors';

import { markSubmissionReportHandledAction } from './submission-report-actions';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/action-gate');
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));
vi.mock('@/lib/services/submission-report-service', () => ({
  SubmissionReportService: { markHandled: vi.fn() },
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

const APPROVER_ID = 'd'.repeat(24);
const REPORT_ID = '507f1f77bcf86cd799439011';
const SUBMISSION_ID = 'c'.repeat(24);

const REFUSAL = {
  success: false as const,
  error: 'Unauthorized',
  code: 'FORBIDDEN' as const,
};

const signIn = (role: string): void => {
  vi.mocked(gateAction).mockResolvedValueOnce({
    success: true,
    session: { user: { id: APPROVER_ID, role } } as never,
  });
};

beforeEach(() => {
  vi.mocked(gateAction).mockReset();
  vi.mocked(SubmissionReportService.markHandled).mockReset();
});

describe('markSubmissionReportHandledAction', () => {
  it('crosses the gate as an approver', async () => {
    signIn('manager');
    vi.mocked(SubmissionReportService.markHandled).mockResolvedValueOnce({
      submissionId: SUBMISSION_ID,
    });

    await markSubmissionReportHandledAction({ reportId: REPORT_ID });

    expect(vi.mocked(gateAction).mock.calls).toEqual([['approver']]);
  });

  it('hands the gate’s refusal back and marks nothing', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    await expect(markSubmissionReportHandledAction({ reportId: REPORT_ID })).resolves.toEqual(
      REFUSAL
    );
    expect(SubmissionReportService.markHandled).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a report id', async () => {
    signIn('admin');

    await expect(markSubmissionReportHandledAction({ reportId: 'nope' })).resolves.toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
    });
    expect(SubmissionReportService.markHandled).not.toHaveBeenCalled();
  });

  it('marks the report handled as the approver who pressed', async () => {
    signIn('manager');
    vi.mocked(SubmissionReportService.markHandled).mockResolvedValueOnce({
      submissionId: SUBMISSION_ID,
    });

    await expect(markSubmissionReportHandledAction({ reportId: REPORT_ID })).resolves.toEqual({
      success: true,
      data: { id: REPORT_ID },
    });
    expect(vi.mocked(SubmissionReportService.markHandled).mock.calls).toEqual([
      [{ id: APPROVER_ID, role: 'manager' }, REPORT_ID],
    ]);
  });

  it('refreshes the queue and the submission’s review page', async () => {
    signIn('admin');
    vi.mocked(SubmissionReportService.markHandled).mockResolvedValueOnce({
      submissionId: SUBMISSION_ID,
    });

    await markSubmissionReportHandledAction({ reportId: REPORT_ID });

    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/admin/community'],
      [`/admin/community/${SUBMISSION_ID}`],
    ]);
  });

  it('hands a refusal from the rules back with its message', async () => {
    signIn('manager');
    vi.mocked(SubmissionReportService.markHandled).mockRejectedValueOnce(
      new SubmissionRuleError('NOT_FOUND', 'Report not found.')
    );

    await expect(markSubmissionReportHandledAction({ reportId: REPORT_ID })).resolves.toEqual({
      success: false,
      error: 'Report not found.',
      code: 'NOT_FOUND',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('hides an unexpected failure behind its own message', async () => {
    signIn('admin');
    vi.mocked(SubmissionReportService.markHandled).mockRejectedValueOnce(new Error('boom'));

    await expect(markSubmissionReportHandledAction({ reportId: REPORT_ID })).resolves.toEqual({
      success: false,
      error: 'We could not mark that report handled. Please try again.',
      code: 'UNKNOWN',
    });
  });
});
