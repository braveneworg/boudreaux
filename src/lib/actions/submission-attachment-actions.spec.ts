/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { gateAction } from '@/lib/auth/action-gate';
import { attachmentUploadLimiter } from '@/lib/config/rate-limit-tiers';
import { SubmissionAttachmentService } from '@/lib/services/submission-attachment-service';
import { SubmissionRuleError } from '@/lib/services/submission-service';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import { allowAttachmentUpload } from '@/lib/utils/submission-allowances';

import {
  confirmAttachmentUploadAction,
  removeAttachmentAction,
  requestAttachmentUploadAction,
} from './submission-attachment-actions';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/action-gate');
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  attachmentUploadLimiter: { check: vi.fn(async () => undefined) },
  ATTACHMENT_UPLOAD_LIMIT: 60,
}));
// An owner has uploads left for the day unless a test says otherwise.
vi.mock('@/lib/utils/submission-allowances', () => ({
  allowAttachmentUpload: vi.fn(async () => true),
}));
vi.mock('@/lib/services/submission-attachment-service', () => ({
  SubmissionAttachmentService: {
    requestUpload: vi.fn(),
    confirmUpload: vi.fn(),
    runReencode: vi.fn(),
    remove: vi.fn(),
  },
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
const SUBMISSION_ID = 'c'.repeat(24);
const ATTACHMENT_ID = 'e'.repeat(24);
const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;

const REFUSAL = {
  success: false as const,
  error: 'Unauthorized',
  code: 'UNAUTHENTICATED' as const,
};

const signIn = (role: string, uploadAgreementVersion: number | null = 1): void => {
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: USER_ID, role, uploadAgreementVersion } } as never,
  });
};

const request = {
  submissionId: SUBMISSION_ID,
  fileName: 'show.jpg',
  contentType: 'image/jpeg',
  fileSize: 1000,
};
const confirm = { submissionId: SUBMISSION_ID, uploadKey: UPLOAD_KEY, fileName: 'show.jpg' };
const remove = { attachmentId: ATTACHMENT_ID };

const submission = { id: SUBMISSION_ID, status: 'DRAFT' } as never;

const revalidated = (): string[] => vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

/** Run what the action deferred until after its response. */
const runAfterTasks = async (): Promise<void> => {
  for (const [task] of vi.mocked(after).mock.calls) {
    await (typeof task === 'function' ? task() : task);
  }
};

beforeEach(() => {
  signIn('admin');
  vi.mocked(SubmissionAttachmentService.requestUpload).mockReset();
  vi.mocked(SubmissionAttachmentService.confirmUpload).mockReset();
  vi.mocked(SubmissionAttachmentService.remove).mockReset();
  vi.mocked(attachmentUploadLimiter.check).mockReset();
});

describe('requestAttachmentUploadAction', () => {
  it('crosses the gate as signed-in', async () => {
    await requestAttachmentUploadAction(request);

    expect(vi.mocked(gateAction).mock.calls).toEqual([['signed-in']]);
  });

  it('answers the gate’s refusal', async () => {
    vi.mocked(gateAction).mockResolvedValue(REFUSAL);

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual(REFUSAL);
  });

  it('is open to a signed-in user who is not an approver', async () => {
    signIn('user');

    await requestAttachmentUploadAction(request);

    expect(SubmissionAttachmentService.requestUpload).toHaveBeenCalledTimes(1);
  });

  it('refuses input that is not an upload request', async () => {
    await expect(
      requestAttachmentUploadAction({ ...request, fileSize: -1 })
    ).resolves.toMatchObject({ success: false, code: 'INVALID_INPUT' });
  });

  it('answers where to upload', async () => {
    const target = { uploadUrl: 'https://signed.example/put', uploadKey: UPLOAD_KEY };
    vi.mocked(SubmissionAttachmentService.requestUpload).mockResolvedValueOnce(target);

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual({
      success: true,
      data: target,
    });
  });

  it('asks as the session’s user, with the agreement they hold', async () => {
    signIn('manager', 1);

    await requestAttachmentUploadAction(request);

    expect(vi.mocked(SubmissionAttachmentService.requestUpload).mock.calls).toEqual([
      [{ id: USER_ID, uploadAgreementVersion: 1 }, request],
    ]);
  });

  it('counts the request against the user’s upload rate', async () => {
    await requestAttachmentUploadAction(request);

    expect(vi.mocked(attachmentUploadLimiter.check).mock.calls).toEqual([[60, USER_ID]]);
  });

  it('counts the request against the user’s uploads for the day', async () => {
    await requestAttachmentUploadAction(request);

    expect(vi.mocked(allowAttachmentUpload).mock.calls).toEqual([[USER_ID]]);
  });

  it('refuses a user who has spent their uploads for the day, and signs nothing', async () => {
    vi.mocked(allowAttachmentUpload).mockResolvedValueOnce(false);

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual({
      success: false,
      error: 'You have added a lot of files today. Try again tomorrow.',
      code: 'LIMIT_EXCEEDED',
    });
    expect(SubmissionAttachmentService.requestUpload).not.toHaveBeenCalled();
  });

  it('spends none of the day’s uploads on a request the minute’s rate refuses', async () => {
    vi.mocked(attachmentUploadLimiter.check).mockRejectedValueOnce(new Error('rate limited'));

    await requestAttachmentUploadAction(request);

    expect(allowAttachmentUpload).not.toHaveBeenCalled();
  });

  it('spends none of the day’s uploads on a request that is not one', async () => {
    await requestAttachmentUploadAction({ ...request, fileSize: -1 });

    expect(allowAttachmentUpload).not.toHaveBeenCalled();
  });

  it('refuses a user past their upload rate, and signs nothing', async () => {
    vi.mocked(attachmentUploadLimiter.check).mockRejectedValueOnce(new Error('rate limited'));

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual({
      success: false,
      error: 'That is a lot of uploads at once. Wait a minute and try again.',
      code: 'LIMIT_EXCEEDED',
    });
    expect(SubmissionAttachmentService.requestUpload).not.toHaveBeenCalled();
  });

  it('shows the rule a refusal names', async () => {
    vi.mocked(SubmissionAttachmentService.requestUpload).mockRejectedValueOnce(
      new SubmissionRuleError('VALIDATION', 'A photo can be up to 20 MB.')
    );

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual({
      success: false,
      error: 'A photo can be up to 20 MB.',
      code: 'VALIDATION',
    });
  });

  it('says so when uploads are not set up', async () => {
    vi.mocked(SubmissionAttachmentService.requestUpload).mockRejectedValueOnce(
      new SubmissionRuleError('UNAVAILABLE', 'Uploads are not set up yet.')
    );

    await expect(requestAttachmentUploadAction(request)).resolves.toMatchObject({
      error: 'Uploads are not set up yet.',
      code: 'UNAVAILABLE',
    });
  });

  it('hides an unexpected failure behind its own copy', async () => {
    vi.mocked(SubmissionAttachmentService.requestUpload).mockRejectedValueOnce(
      new Error('ECONNRESET 10.0.0.4')
    );

    await expect(requestAttachmentUploadAction(request)).resolves.toEqual({
      success: false,
      error: 'We could not start that upload. Please try again.',
      code: 'UNKNOWN',
    });
  });
});

describe('confirmAttachmentUploadAction', () => {
  const confirmed = (): void => {
    vi.mocked(SubmissionAttachmentService.confirmUpload).mockResolvedValueOnce({
      attachmentId: ATTACHMENT_ID,
      submission,
    });
  };

  it('crosses the gate as signed-in', async () => {
    confirmed();

    await confirmAttachmentUploadAction(confirm);

    expect(vi.mocked(gateAction).mock.calls).toEqual([['signed-in']]);
  });

  it('is open to a signed-in user who is not an approver', async () => {
    signIn('user');
    confirmed();

    await expect(confirmAttachmentUploadAction(confirm)).resolves.toMatchObject({ success: true });
  });

  it('answers the gate’s refusal', async () => {
    vi.mocked(gateAction).mockResolvedValue(REFUSAL);

    await expect(confirmAttachmentUploadAction(confirm)).resolves.toEqual(REFUSAL);
  });

  it('refuses a key the app did not make', async () => {
    await expect(
      confirmAttachmentUploadAction({ ...confirm, uploadKey: 'media/videos/x.mp4' })
    ).resolves.toMatchObject({ success: false, code: 'INVALID_INPUT' });
  });

  it('answers the new attachment and where its submission now stands', async () => {
    confirmed();

    await expect(confirmAttachmentUploadAction(confirm)).resolves.toEqual({
      success: true,
      data: { attachmentId: ATTACHMENT_ID, status: 'DRAFT' },
    });
  });

  it('confirms as the session’s user', async () => {
    confirmed();

    await confirmAttachmentUploadAction(confirm);

    expect(vi.mocked(SubmissionAttachmentService.confirmUpload).mock.calls).toEqual([
      [USER_ID, confirm],
    ]);
  });

  it('runs the re-encode after the response', async () => {
    confirmed();

    await confirmAttachmentUploadAction(confirm);
    await runAfterTasks();

    expect(vi.mocked(SubmissionAttachmentService.runReencode).mock.calls).toEqual([
      [ATTACHMENT_ID],
    ]);
  });

  it('revalidates the submission’s pages', async () => {
    confirmed();

    await confirmAttachmentUploadAction(confirm);

    expect(revalidated()).toEqual([
      '/community/mine',
      `/community/${SUBMISSION_ID}`,
      '/admin/community',
      '/community',
    ]);
  });

  it('runs nothing for a refused confirm', async () => {
    vi.mocked(SubmissionAttachmentService.confirmUpload).mockRejectedValueOnce(
      new SubmissionRuleError('LIMIT_EXCEEDED', 'A submission can have 10 attachments.')
    );

    await expect(confirmAttachmentUploadAction(confirm)).resolves.toMatchObject({
      success: false,
      code: 'LIMIT_EXCEEDED',
    });
    expect(after).not.toHaveBeenCalled();
  });
});

describe('removeAttachmentAction', () => {
  it('crosses the gate as signed-in', async () => {
    vi.mocked(SubmissionAttachmentService.remove).mockResolvedValueOnce(submission);

    await removeAttachmentAction(remove);

    expect(vi.mocked(gateAction).mock.calls).toEqual([['signed-in']]);
  });

  it('is open to a signed-in user who is not an approver', async () => {
    signIn('user');
    vi.mocked(SubmissionAttachmentService.remove).mockResolvedValueOnce(submission);

    await expect(removeAttachmentAction(remove)).resolves.toMatchObject({ success: true });
  });

  it('answers the gate’s refusal', async () => {
    vi.mocked(gateAction).mockResolvedValue(REFUSAL);

    await expect(removeAttachmentAction(remove)).resolves.toEqual(REFUSAL);
  });

  it('refuses input that is not an attachment id', async () => {
    await expect(removeAttachmentAction({ attachmentId: 'x' })).resolves.toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
    });
  });

  it('removes as the session’s user and answers where the submission stands', async () => {
    vi.mocked(SubmissionAttachmentService.remove).mockResolvedValueOnce(submission);

    await expect(removeAttachmentAction(remove)).resolves.toEqual({
      success: true,
      data: { status: 'DRAFT' },
    });
    expect(vi.mocked(SubmissionAttachmentService.remove).mock.calls).toEqual([
      [USER_ID, ATTACHMENT_ID],
    ]);
  });

  it('revalidates the submission’s pages', async () => {
    vi.mocked(SubmissionAttachmentService.remove).mockResolvedValueOnce(submission);

    await removeAttachmentAction(remove);

    expect(revalidated()).toEqual([
      '/community/mine',
      `/community/${SUBMISSION_ID}`,
      '/admin/community',
      '/community',
    ]);
  });

  it('shows the rule a refusal names', async () => {
    vi.mocked(SubmissionAttachmentService.remove).mockRejectedValueOnce(
      new SubmissionRuleError('INVALID_INPUT', 'This attachment is still processing.')
    );

    await expect(removeAttachmentAction(remove)).resolves.toEqual({
      success: false,
      error: 'This attachment is still processing.',
      code: 'INVALID_INPUT',
    });
  });
});
