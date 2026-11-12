/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { sendSubmissionEmail } from '@/lib/email/send-submission-email';
import { UserRepository } from '@/lib/repositories/user-repository';
import type { SubmissionRecord, SubmissionWithOwnerRecord } from '@/lib/types/domain/submission';
import type { UserAdminRecord } from '@/lib/types/domain/user';

import {
  notifyApproversOfSubmission,
  notifyOwnerOfDecision,
  remindApproversOfOverdue,
} from './submission-notices';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findApprovers: vi.fn() },
}));
vi.mock('@/lib/email/send-submission-email', () => ({ sendSubmissionEmail: vi.fn() }));

const smsSend = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/get-sms-service', () => ({
  getSmsService: () => ({ send: smsSend }),
}));

const OWNER_ID = 'a'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const BASE = 'https://example.com';
const WHEN = new Date('2026-11-11T12:00:00.000Z');

const submission = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  id: SUBMISSION_ID,
  ownerId: OWNER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>SECRET-ABOUT</p>',
  writingHtml: '<p>SECRET-WRITING</p>',
  links: [],
  listed: false,
  status: 'AWAITING_APPROVAL',
  publishedAt: WHEN,
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

const withOwner = (overrides: Partial<SubmissionRecord> = {}): SubmissionWithOwnerRecord => ({
  ...submission(overrides),
  owner: { id: OWNER_ID, username: 'fan', email: 'fan@example.com', banned: false },
});

const approver = (overrides: Partial<UserAdminRecord> = {}): UserAdminRecord => ({
  id: 'd'.repeat(24),
  email: 'mgr@example.com',
  username: 'manager1',
  phone: null,
  allowSmsNotifications: false,
  ...overrides,
});

/** The emails sent, as recipient and subject. */
const sentTo = (): Array<[string, string]> =>
  vi.mocked(sendSubmissionEmail).mock.calls.map(([{ toEmail, subject }]) => [toEmail, subject]);

/** Everything the first email sent says, in both bodies. */
const firstBody = (): string => {
  const [{ text, html }] = vi.mocked(sendSubmissionEmail).mock.calls[0] ?? [{ text: '', html: '' }];
  return `${text}\n${html}`;
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE);
  vi.mocked(UserRepository.findApprovers).mockReset();
  vi.mocked(sendSubmissionEmail).mockReset();
  vi.mocked(sendSubmissionEmail).mockResolvedValue(true);
  smsSend.mockReset();
  smsSend.mockResolvedValue({ ok: true });
});

describe('notifyApproversOfSubmission', () => {
  it('emails every approver once, naming the title', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver(),
      approver({ id: 'e'.repeat(24), email: 'admin@example.com', username: 'boss' }),
    ]);

    await notifyApproversOfSubmission(submission());

    expect(sentTo()).toEqual([
      ['mgr@example.com', 'Awaiting approval: Bus poem'],
      ['admin@example.com', 'Awaiting approval: Bus poem'],
    ]);
  });

  it('links each approver to the submission in the approver section, through sign-in', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([approver()]);

    await notifyApproversOfSubmission(submission());

    expect(firstBody()).toContain(
      `${BASE}/signin?callbackUrl=${encodeURIComponent(`/admin/community/${SUBMISSION_ID}`)}`
    );
  });

  it('carries neither the about nor the writing', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([approver()]);

    await notifyApproversOfSubmission(submission());

    expect(firstBody()).not.toContain('SECRET');
  });

  it('does not email the owner about their own submission', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver({ id: OWNER_ID, email: 'owner-admin@example.com' }),
      approver(),
    ]);

    await notifyApproversOfSubmission(submission());

    expect(sentTo()).toEqual([['mgr@example.com', 'Awaiting approval: Bus poem']]);
  });

  it('names an untitled submission as untitled', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([approver()]);

    await notifyApproversOfSubmission(submission({ title: '' }));

    expect(sentTo()).toEqual([['mgr@example.com', 'Awaiting approval: Untitled']]);
  });

  it('texts an approver who opted in and has a phone', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver({ allowSmsNotifications: true, phone: '+15550001234' }),
    ]);

    await notifyApproversOfSubmission(submission());

    expect(smsSend.mock.calls).toEqual([
      [
        '+15550001234',
        `[boudreaux] A submission is awaiting approval: "Bus poem". Review: ${BASE}/admin/community`,
        { transactional: true },
      ],
    ]);
  });

  it.each([
    ['who did not opt in', { allowSmsNotifications: false, phone: '+15550001234' }],
    ['with no phone', { allowSmsNotifications: true, phone: null }],
  ])('does not text an approver %s', async (_name, overrides) => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([approver(overrides)]);

    await notifyApproversOfSubmission(submission());

    expect(smsSend).not.toHaveBeenCalled();
  });

  it('texts nobody under E2E, where a worktree may carry a live SMS provider', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver({ allowSmsNotifications: true, phone: '+15550001234' }),
    ]);

    await notifyApproversOfSubmission(submission());

    expect(smsSend).not.toHaveBeenCalled();
  });

  it('still emails the others when one approver’s email fails', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver(),
      approver({ id: 'e'.repeat(24), email: 'admin@example.com' }),
    ]);
    vi.mocked(sendSubmissionEmail).mockRejectedValueOnce(new Error('SES down'));

    await expect(notifyApproversOfSubmission(submission())).resolves.toBeUndefined();
    expect(sentTo().map(([toEmail]) => toEmail)).toEqual(['mgr@example.com', 'admin@example.com']);
  });

  it('sends nothing when there are no approvers', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([]);

    await notifyApproversOfSubmission(submission());

    expect(sendSubmissionEmail).not.toHaveBeenCalled();
  });
});

describe('remindApproversOfOverdue', () => {
  it('emails every approver how many have waited, with a link to the queue', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver(),
      approver({ id: 'e'.repeat(24), email: 'admin@example.com' }),
    ]);

    await remindApproversOfOverdue(3);

    expect(sentTo()).toEqual([
      ['mgr@example.com', '3 submissions have waited more than 5 business days'],
      ['admin@example.com', '3 submissions have waited more than 5 business days'],
    ]);
    expect(firstBody()).toContain(
      `${BASE}/signin?callbackUrl=${encodeURIComponent('/admin/community')}`
    );
  });

  it('writes one overdue submission in the singular', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([approver()]);

    await remindApproversOfOverdue(1);

    expect(sentTo()).toEqual([
      ['mgr@example.com', '1 submission has waited more than 5 business days'],
    ]);
  });

  it('texts nobody: a daily reminder is not worth a text', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([
      approver({ allowSmsNotifications: true, phone: '+15550001234' }),
    ]);

    await remindApproversOfOverdue(2);

    expect(smsSend).not.toHaveBeenCalled();
  });

  it('sends nothing when there are no approvers', async () => {
    vi.mocked(UserRepository.findApprovers).mockResolvedValueOnce([]);

    await remindApproversOfOverdue(2);

    expect(sendSubmissionEmail).not.toHaveBeenCalled();
  });
});

describe('notifyOwnerOfDecision', () => {
  it('tells the owner an approved submission is live, with its link', async () => {
    await notifyOwnerOfDecision(withOwner({ status: 'APPROVED', listed: true }));

    expect(sentTo()).toEqual([['fan@example.com', 'Approved: Bus poem']]);
    expect(firstBody()).toContain(`${BASE}/community/${SUBMISSION_ID}`);
  });

  it('says an unlisted approved submission is reachable by its link only', async () => {
    await notifyOwnerOfDecision(withOwner({ status: 'APPROVED', listed: false }));

    expect(firstBody()).toContain('only people with the link can open it');
  });

  it('tells the owner a rejected submission is offline, with the reason and a way back', async () => {
    await notifyOwnerOfDecision(
      withOwner({ status: 'REJECTED', rejectionReason: 'Not your recording.' })
    );

    expect(sentTo()).toEqual([['fan@example.com', 'Changes needed: Bus poem']]);
    expect(firstBody()).toContain('Not your recording.');
    expect(firstBody()).toContain(
      `${BASE}/signin?callbackUrl=${encodeURIComponent(`/community/${SUBMISSION_ID}/edit`)}`
    );
  });

  it('carries neither the about nor the writing', async () => {
    await notifyOwnerOfDecision(withOwner({ status: 'APPROVED' }));

    expect(firstBody()).not.toContain('SECRET');
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL'] as const)(
    'sends nothing for a %s submission, which is not a decision',
    async (status) => {
      await notifyOwnerOfDecision(withOwner({ status }));

      expect(sendSubmissionEmail).not.toHaveBeenCalled();
    }
  );

  it('greets an owner with no username by the name in their address', async () => {
    await notifyOwnerOfDecision({
      ...withOwner({ status: 'APPROVED' }),
      owner: { id: OWNER_ID, username: null, email: 'fan@example.com', banned: false },
    });

    expect(firstBody()).toContain('Hi fan,');
  });
});
