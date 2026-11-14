/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ManagerService } from '@/lib/services/manager-service';
import { SubmissionRuleError, SubmissionService } from '@/lib/services/submission-service';
import { DataError } from '@/lib/types/domain/errors';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type { SubmissionRecord } from '@/lib/types/domain/submission';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';

import {
  approveSubmissionAction,
  deleteSubmissionAction,
  grantManagerAction,
  publishSubmissionAction,
  rejectSubmissionAction,
  removeManagerAction,
  saveSubmissionDraftAction,
  setSubmissionListedAction,
} from './submission-actions';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/action-gate');
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.9' })),
}));
vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));
vi.mock('@/lib/services/manager-service', () => ({
  ManagerService: { grant: vi.fn(), remove: vi.fn() },
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

  return {
    SubmissionRuleError,
    SubmissionService: {
      save: vi.fn(),
      setListed: vi.fn(),
      delete: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      queuePositionOf: vi.fn(),
    },
  };
});

const USER_ID = 'a'.repeat(24);
const SUBMISSION_ID = '507f1f77bcf86cd799439011';
const LOADED = '2026-11-10T09:00:00.000Z';
const WHEN = new Date('2026-11-11T12:00:00.000Z');

const REFUSAL = {
  success: false as const,
  error: 'Unauthorized',
  code: 'UNAUTHENTICATED' as const,
};
const FORBIDDEN = { success: false, error: 'Unauthorized', code: 'FORBIDDEN' };

const signIn = (role: string, uploadAgreementVersion: number | null = 1): void => {
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: USER_ID, role, uploadAgreementVersion } } as never,
  });
};

const record = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  id: SUBMISSION_ID,
  ownerId: USER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>A poem.</p>',
  links: [],
  listed: false,
  status: 'DRAFT',
  publishedAt: null,
  firstApprovedAt: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
  createdAt: WHEN,
  updatedAt: WHEN,
  ...overrides,
});

const form = {
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>A poem.</p>',
  links: [],
  listed: false,
  acceptAgreement: false,
  turnstileToken: 'token',
};

const { turnstileToken: _token, ...formWithoutToken } = form;

beforeEach(() => {
  signIn('admin');
  vi.mocked(verifyTurnstile).mockResolvedValue({ success: true });
  vi.mocked(SubmissionService.queuePositionOf).mockResolvedValue(null);
});

describe.each([
  ['saveSubmissionDraftAction', saveSubmissionDraftAction, false],
  ['publishSubmissionAction', publishSubmissionAction, true],
] as const)('%s', (_name, action, publish) => {
  it('crosses the gate as signed-in', async () => {
    vi.mocked(SubmissionService.save).mockResolvedValueOnce(record());

    await action(form);

    expect(vi.mocked(gateAction).mock.calls).toEqual([['signed-in']]);
  });

  it('answers the gate’s refusal and saves nothing', async () => {
    vi.mocked(gateAction).mockResolvedValue(REFUSAL);

    await expect(action(form)).resolves.toEqual(REFUSAL);
    expect(SubmissionService.save).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not an approver, before launch', async () => {
    signIn('user');

    await expect(action(form)).resolves.toEqual(FORBIDDEN);
    expect(SubmissionService.save).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('refuses input that fails validation, on its field', async () => {
    await expect(action({ ...form, category: 'PODCAST' })).resolves.toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
      fieldErrors: { category: [expect.any(String)] },
    });
    expect(SubmissionService.save).not.toHaveBeenCalled();
  });

  it('verifies the token against the caller’s IP before saving', async () => {
    vi.mocked(SubmissionService.save).mockResolvedValueOnce(record());

    await action(form);

    expect(vi.mocked(verifyTurnstile).mock.calls).toEqual([['token', '203.0.113.9']]);
  });

  it('refuses a token that fails verification, on the verification field', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValueOnce({
      success: false,
      error: 'Invalid verification. Please try again.',
    });

    await expect(action(form)).resolves.toEqual({
      success: false,
      error: 'Invalid verification. Please try again.',
      code: 'INVALID_INPUT',
      fieldErrors: { turnstileToken: ['Invalid verification. Please try again.'] },
    });
    expect(SubmissionService.save).not.toHaveBeenCalled();
  });

  it('saves as the session’s user with their agreement version, without the token', async () => {
    signIn('manager', null);
    vi.mocked(SubmissionService.save).mockResolvedValueOnce(record());

    await action(form);

    expect(vi.mocked(SubmissionService.save).mock.calls).toEqual([
      [{ id: USER_ID, uploadAgreementVersion: null }, formWithoutToken, { publish }],
    ]);
  });

  it('answers the saved submission with its queue position', async () => {
    const saved = record({ status: publish ? 'AWAITING_APPROVAL' : 'DRAFT', listed: true });
    vi.mocked(SubmissionService.save).mockResolvedValueOnce(saved);
    vi.mocked(SubmissionService.queuePositionOf).mockResolvedValueOnce(publish ? 2 : null);

    await expect(action(form)).resolves.toEqual({
      success: true,
      data: {
        id: SUBMISSION_ID,
        status: saved.status,
        listed: true,
        queuePosition: publish ? 2 : null,
      },
    });
    expect(vi.mocked(SubmissionService.queuePositionOf).mock.calls).toEqual([[saved]]);
  });

  it('revalidates the owner’s list, the submission’s page and the queue', async () => {
    vi.mocked(SubmissionService.save).mockResolvedValueOnce(record());

    await action(form);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/community/mine'],
      [`/community/${SUBMISSION_ID}`],
      ['/admin/community'],
    ]);
  });

  it('puts a rule the service raised on the field it names, with its message', async () => {
    vi.mocked(SubmissionService.save).mockRejectedValueOnce(
      new SubmissionRuleError('VALIDATION', 'Add a title before publishing.', 'title')
    );

    await expect(action(form)).resolves.toEqual({
      success: false,
      error: 'Add a title before publishing.',
      code: 'VALIDATION',
      fieldErrors: { title: ['Add a title before publishing.'] },
    });
  });

  it('answers a rule with no field as a form-level failure', async () => {
    vi.mocked(SubmissionService.save).mockRejectedValueOnce(
      new SubmissionRuleError('LIMIT_EXCEEDED', 'You can have 5 submissions.')
    );

    await expect(action(form)).resolves.toEqual({
      success: false,
      error: 'You can have 5 submissions.',
      code: 'LIMIT_EXCEEDED',
    });
  });

  it('hides a database failure behind the fallback copy, keeping its code', async () => {
    vi.mocked(SubmissionService.save).mockRejectedValueOnce(
      new DataError('UNAVAILABLE', 'connect ECONNREFUSED 10.0.0.5:27017', new Error('raw'))
    );

    await expect(action(form)).resolves.toEqual({
      success: false,
      error: 'We could not save your submission. Please try again.',
      code: 'UNAVAILABLE',
    });
  });

  it('answers an unexpected failure as UNKNOWN with the fallback copy', async () => {
    vi.mocked(SubmissionService.save).mockRejectedValueOnce(new Error('boom'));

    await expect(action(form)).resolves.toEqual({
      success: false,
      error: 'We could not save your submission. Please try again.',
      code: 'UNKNOWN',
    });
  });
});

describe('setSubmissionListedAction', () => {
  const input = { submissionId: SUBMISSION_ID, listed: true };

  it('switches the session user’s submission and answers it', async () => {
    vi.mocked(SubmissionService.setListed).mockResolvedValueOnce(
      record({ status: 'APPROVED', listed: true })
    );

    await expect(setSubmissionListedAction(input)).resolves.toEqual({
      success: true,
      data: { id: SUBMISSION_ID, status: 'APPROVED', listed: true, queuePosition: null },
    });
    expect(vi.mocked(SubmissionService.setListed).mock.calls).toEqual([
      [USER_ID, SUBMISSION_ID, true],
    ]);
    expect(vi.mocked(gateAction).mock.calls).toEqual([['signed-in']]);
  });

  it('needs no verification token', async () => {
    vi.mocked(SubmissionService.setListed).mockResolvedValueOnce(record({ status: 'APPROVED' }));

    await setSubmissionListedAction(input);

    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not an approver, before launch', async () => {
    signIn('user');

    await expect(setSubmissionListedAction(input)).resolves.toEqual(FORBIDDEN);
    expect(SubmissionService.setListed).not.toHaveBeenCalled();
  });

  it('refuses a malformed id', async () => {
    await expect(
      setSubmissionListedAction({ submissionId: 'nope', listed: true })
    ).resolves.toMatchObject({ success: false, code: 'INVALID_INPUT' });
  });

  it('answers the service’s refusal with its message', async () => {
    vi.mocked(SubmissionService.setListed).mockRejectedValueOnce(
      new SubmissionRuleError('NOT_FOUND', 'Only an approved submission can be listed or unlisted.')
    );

    await expect(setSubmissionListedAction(input)).resolves.toEqual({
      success: false,
      error: 'Only an approved submission can be listed or unlisted.',
      code: 'NOT_FOUND',
    });
  });
});

describe('deleteSubmissionAction', () => {
  const input = { submissionId: SUBMISSION_ID };

  it('deletes the session user’s submission and revalidates', async () => {
    vi.mocked(SubmissionService.delete).mockResolvedValueOnce(undefined);

    await expect(deleteSubmissionAction(input)).resolves.toEqual({
      success: true,
      data: { id: SUBMISSION_ID },
    });
    expect(vi.mocked(SubmissionService.delete).mock.calls).toEqual([[USER_ID, SUBMISSION_ID]]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/community/mine'],
      [`/community/${SUBMISSION_ID}`],
      ['/admin/community'],
    ]);
  });

  it('refuses a signed-in user who is not an approver, before launch', async () => {
    signIn('user');

    await expect(deleteSubmissionAction(input)).resolves.toEqual(FORBIDDEN);
    expect(SubmissionService.delete).not.toHaveBeenCalled();
  });

  it('answers the gate’s refusal', async () => {
    vi.mocked(gateAction).mockResolvedValue(REFUSAL);

    await expect(deleteSubmissionAction(input)).resolves.toEqual(REFUSAL);
  });

  it('answers not found with the service’s message', async () => {
    vi.mocked(SubmissionService.delete).mockRejectedValueOnce(
      new SubmissionRuleError('NOT_FOUND', 'Submission not found.')
    );

    await expect(deleteSubmissionAction(input)).resolves.toEqual({
      success: false,
      error: 'Submission not found.',
      code: 'NOT_FOUND',
    });
  });
});

describe('approveSubmissionAction', () => {
  const input = { submissionId: SUBMISSION_ID, loadedUpdatedAt: LOADED };

  it('crosses the gate as an approver and decides as the session’s user', async () => {
    signIn('manager');
    vi.mocked(SubmissionService.approve).mockResolvedValueOnce(record({ status: 'APPROVED' }));

    await expect(approveSubmissionAction(input)).resolves.toEqual({
      success: true,
      data: { id: SUBMISSION_ID, status: 'APPROVED', listed: false, queuePosition: null },
    });
    expect(vi.mocked(gateAction).mock.calls).toEqual([['approver']]);
    expect(vi.mocked(SubmissionService.approve).mock.calls).toEqual([
      [{ id: USER_ID, role: 'manager' }, input],
    ]);
  });

  it('answers the gate’s refusal and decides nothing', async () => {
    vi.mocked(gateAction).mockResolvedValue({ ...REFUSAL, code: 'FORBIDDEN' });

    await expect(approveSubmissionAction(input)).resolves.toMatchObject({ code: 'FORBIDDEN' });
    expect(SubmissionService.approve).not.toHaveBeenCalled();
  });

  it('refuses a loaded moment that is not a datetime', async () => {
    await expect(
      approveSubmissionAction({ submissionId: SUBMISSION_ID, loadedUpdatedAt: 'yesterday' })
    ).resolves.toMatchObject({ success: false, code: 'INVALID_INPUT' });
  });

  it('answers a decision on changed content as DUPLICATE with the service’s message', async () => {
    vi.mocked(SubmissionService.approve).mockRejectedValueOnce(
      new SubmissionRuleError('DUPLICATE', 'This submission changed since you opened it.')
    );

    await expect(approveSubmissionAction(input)).resolves.toEqual({
      success: false,
      error: 'This submission changed since you opened it.',
      code: 'DUPLICATE',
    });
  });

  it('revalidates the queue, the page and the owner’s list', async () => {
    vi.mocked(SubmissionService.approve).mockResolvedValueOnce(record({ status: 'APPROVED' }));

    await approveSubmissionAction(input);

    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/community/mine'],
      [`/community/${SUBMISSION_ID}`],
      ['/admin/community'],
    ]);
  });
});

describe('rejectSubmissionAction', () => {
  const input = {
    submissionId: SUBMISSION_ID,
    loadedUpdatedAt: LOADED,
    reason: 'Not your recording.',
  };

  it('crosses the gate as an approver and rejects with the reason', async () => {
    vi.mocked(SubmissionService.reject).mockResolvedValueOnce(record({ status: 'REJECTED' }));

    await expect(rejectSubmissionAction(input)).resolves.toEqual({
      success: true,
      data: { id: SUBMISSION_ID, status: 'REJECTED', listed: false, queuePosition: null },
    });
    expect(vi.mocked(gateAction).mock.calls).toEqual([['approver']]);
    expect(vi.mocked(SubmissionService.reject).mock.calls).toEqual([
      [{ id: USER_ID, role: 'admin' }, input],
    ]);
  });

  it('refuses a rejection with no reason, on the reason field', async () => {
    await expect(
      rejectSubmissionAction({ submissionId: SUBMISSION_ID, loadedUpdatedAt: LOADED, reason: ' ' })
    ).resolves.toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
      fieldErrors: { reason: [expect.any(String)] },
    });
    expect(SubmissionService.reject).not.toHaveBeenCalled();
  });
});

describe.each([
  ['grantManagerAction', grantManagerAction, ManagerService.grant],
  ['removeManagerAction', removeManagerAction, ManagerService.remove],
] as const)('%s', (_name, action, serviceCall) => {
  it('crosses the gate as an admin and acts on the trimmed username', async () => {
    vi.mocked(serviceCall).mockResolvedValueOnce(undefined);

    await expect(action({ username: ' street_team ' })).resolves.toEqual({
      success: true,
      data: { username: 'street_team' },
    });
    expect(vi.mocked(gateAction).mock.calls).toEqual([['admin']]);
    expect(vi.mocked(serviceCall).mock.calls).toEqual([['street_team']]);
  });

  it('answers the gate’s refusal, so a manager changes nobody’s role', async () => {
    vi.mocked(gateAction).mockResolvedValue({ ...REFUSAL, code: 'FORBIDDEN' });

    await expect(action({ username: 'street_team' })).resolves.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(serviceCall).not.toHaveBeenCalled();
  });

  it('refuses a username it cannot be', async () => {
    await expect(action({ username: 'not a name!' })).resolves.toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
      fieldErrors: { username: [expect.any(String)] },
    });
  });

  it('answers the service’s refusal on the username field', async () => {
    vi.mocked(serviceCall).mockRejectedValueOnce(
      new DataError('NOT_FOUND', 'No user has that username.')
    );

    await expect(action({ username: 'ghost' })).resolves.toEqual({
      success: false,
      error: 'No user has that username.',
      code: 'NOT_FOUND',
      fieldErrors: { username: ['No user has that username.'] },
    });
  });

  it('revalidates the managers screen', async () => {
    vi.mocked(serviceCall).mockResolvedValueOnce(undefined);

    await action({ username: 'street_team' });

    expect(vi.mocked(revalidatePath).mock.calls).toEqual([['/admin/community/managers']]);
  });
});
