/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_OPEN_REPORTS_PER_SUBMISSION,
  REPORT_CONTACT_RETENTION_DAYS,
} from '@/lib/constants/submissions';
import { SubmissionReportRepository } from '@/lib/repositories/submission-report-repository';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import { notifyApproversOfReport } from '@/lib/services/submission-notices';
import type { SubmissionRecord, SubmissionWithOwnerRecord } from '@/lib/types/domain/submission';
import type { SubmissionReportRecord } from '@/lib/types/domain/submission-report';
import {
  allowSubmissionReportNotice,
  checkSubmissionReportRateLimit,
} from '@/lib/utils/submission-report-rate-limit';

import { SubmissionReportService } from './submission-report-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/submission-repository', () => ({
  SubmissionRepository: { findByIdWithOwner: vi.fn(), findManyWithOwnerByIds: vi.fn() },
  isPublicSubmission: ({ status, owner }: { status: string; owner: { banned?: boolean | null } }) =>
    status === 'APPROVED' && owner.banned !== true,
}));
vi.mock('@/lib/repositories/submission-report-repository', () => ({
  SubmissionReportRepository: {
    create: vi.fn(),
    countOpenFor: vi.fn(),
    countOpen: vi.fn(),
    listBySubmission: vi.fn(),
    findTarget: vi.fn(),
    markHandled: vi.fn(),
    listReportedSubmissions: vi.fn(),
    countReportedSubmissions: vi.fn(),
    eraseContactsFiledBefore: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findUsernamesByIds: vi.fn() },
}));
vi.mock('@/lib/services/submission-notices', () => ({ notifyApproversOfReport: vi.fn() }));
vi.mock('@/lib/utils/submission-report-rate-limit', () => ({
  checkSubmissionReportRateLimit: vi.fn(),
  allowSubmissionReportNotice: vi.fn(),
}));
// The submission service is imported for its rule error alone; keep its
// attachment store, and the S3 client behind it, out of this spec.
vi.mock('@/lib/services/submission-attachment-store', () => ({ attachmentStore: {} }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn() }, notifications: { error: vi.fn() } },
}));

const NOW = new Date('2026-11-12T12:00:00.000Z');
const FILED = new Date('2026-11-10T09:00:00.000Z');
const OWNER_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const REPORT_ID = 'e'.repeat(24);
const REPORTER = 'guest:fingerprint';

const admin = { id: OTHER_ID, role: 'admin' };
const manager = { id: OTHER_ID, role: 'manager' };
const owningManager = { id: OWNER_ID, role: 'manager' };
const owningAdmin = { id: OWNER_ID, role: 'admin' };

const submission = (
  overrides: Partial<SubmissionRecord> = {},
  owner: Partial<SubmissionWithOwnerRecord['owner']> = {}
): SubmissionWithOwnerRecord => ({
  id: SUBMISSION_ID,
  ownerId: OWNER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>A poem.</p>',
  links: [],
  listed: true,
  status: 'APPROVED',
  publishedAt: FILED,
  firstApprovedAt: FILED,
  approvedAt: FILED,
  approvedBy: OTHER_ID,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
  createdAt: FILED,
  updatedAt: FILED,
  ...overrides,
  owner: { id: OWNER_ID, username: 'fan', email: 'fan@example.com', banned: false, ...owner },
});

const report = (overrides: Partial<SubmissionReportRecord> = {}): SubmissionReportRecord => ({
  id: REPORT_ID,
  submissionId: SUBMISSION_ID,
  reason: 'NOT_THEIRS',
  note: 'That is my photo.',
  contactEmail: 'wronged@example.com',
  handled: false,
  handledAt: null,
  handledBy: null,
  createdAt: FILED,
  ...overrides,
});

const input = {
  submissionId: SUBMISSION_ID,
  reason: 'NOT_THEIRS',
  note: 'That is my photo.',
  contactEmail: 'wronged@example.com',
} as const;

const reports = vi.mocked(SubmissionReportRepository);

/** A public submission, both limits allowing, room for one more report. */
const arrangeFiling = (): void => {
  vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(submission());
  vi.mocked(checkSubmissionReportRateLimit).mockResolvedValueOnce({
    success: true,
    blockedBy: null,
  });
  reports.countOpenFor.mockResolvedValueOnce(0);
  reports.create.mockResolvedValueOnce(report());
};

beforeEach(() => {
  vi.mocked(SubmissionRepository.findByIdWithOwner).mockReset();
  vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mockReset();
  vi.mocked(UserRepository.findUsernamesByIds).mockReset();
  vi.mocked(checkSubmissionReportRateLimit).mockReset();
  vi.mocked(allowSubmissionReportNotice).mockReset();
  vi.mocked(notifyApproversOfReport).mockReset();
  for (const mock of Object.values(reports)) {
    mock.mockReset();
  }
});

describe('SubmissionReportService.file', () => {
  it('stores the report against the submission, with only what was said', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);

    await SubmissionReportService.file(input, REPORTER);

    expect(reports.create.mock.calls).toEqual([[input]]);
  });

  it('hands back the stored report', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);

    await expect(SubmissionReportService.file(input, REPORTER)).resolves.toEqual({
      stored: true,
      report: report(),
    });
  });

  it('spends the limits as the reporter it was given, on this submission', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);

    await SubmissionReportService.file(input, REPORTER);

    expect(vi.mocked(checkSubmissionReportRateLimit).mock.calls).toEqual([
      [{ reporterKey: REPORTER, submissionId: SUBMISSION_ID }],
    ]);
  });

  it('tells approvers, with the submission and the reason and nothing else', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);

    await SubmissionReportService.file(input, REPORTER);

    expect(vi.mocked(notifyApproversOfReport).mock.calls).toEqual([[submission(), 'NOT_THEIRS']]);
  });

  it('counts the notice against the submission', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);

    await SubmissionReportService.file(input, REPORTER);

    expect(vi.mocked(allowSubmissionReportNotice).mock.calls).toEqual([[SUBMISSION_ID]]);
  });

  it('stores a report and sends no notice once the submission has had its notices', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(false);

    const filed = await SubmissionReportService.file(input, REPORTER);

    expect(filed.stored).toBe(true);
    expect(notifyApproversOfReport).not.toHaveBeenCalled();
  });

  it('keeps the report when its notice fails', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockResolvedValueOnce(true);
    vi.mocked(notifyApproversOfReport).mockRejectedValueOnce(new Error('SES down'));

    await expect(SubmissionReportService.file(input, REPORTER)).resolves.toMatchObject({
      stored: true,
    });
  });

  it('keeps the report when the notice limit itself fails', async () => {
    arrangeFiling();
    vi.mocked(allowSubmissionReportNotice).mockRejectedValueOnce(new Error('limiter broke'));

    await expect(SubmissionReportService.file(input, REPORTER)).resolves.toMatchObject({
      stored: true,
    });
  });

  it.each([
    ['a draft', submission({ status: 'DRAFT' })],
    ['one awaiting approval', submission({ status: 'AWAITING_APPROVAL' })],
    ['a rejected one', submission({ status: 'REJECTED' })],
    ['an approved one whose owner is banned', submission({}, { banned: true })],
    ['an id that names none', null],
  ])('answers as sent and stores nothing for %s', async (_name, found) => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(found);

    await expect(SubmissionReportService.file(input, REPORTER)).resolves.toEqual({
      stored: false,
    });
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('spends no limit on a submission that is not public, so a limit cannot probe an id', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(null);

    await SubmissionReportService.file(input, REPORTER);

    expect(checkSubmissionReportRateLimit).not.toHaveBeenCalled();
  });

  it('refuses a reporter’s second report on the same submission', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(submission());
    vi.mocked(checkSubmissionReportRateLimit).mockResolvedValueOnce({
      success: false,
      blockedBy: 'submission',
    });

    await expect(SubmissionReportService.file(input, REPORTER)).rejects.toMatchObject({
      code: 'LIMIT_EXCEEDED',
      message: 'You have already reported this submission. Our team has your report.',
    });
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('refuses a reporter who has filed too many today', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(submission());
    vi.mocked(checkSubmissionReportRateLimit).mockResolvedValueOnce({
      success: false,
      blockedBy: 'reporter',
    });

    await expect(SubmissionReportService.file(input, REPORTER)).rejects.toMatchObject({
      code: 'LIMIT_EXCEEDED',
      message:
        'You have sent several reports today. Try again tomorrow, or write to us through the contact page.',
    });
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('answers as sent and stores nothing once the submission holds the most open reports', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(submission());
    vi.mocked(checkSubmissionReportRateLimit).mockResolvedValueOnce({
      success: true,
      blockedBy: null,
    });
    reports.countOpenFor.mockResolvedValueOnce(MAX_OPEN_REPORTS_PER_SUBMISSION);

    await expect(SubmissionReportService.file(input, REPORTER)).resolves.toEqual({
      stored: false,
    });
    expect(reports.create).not.toHaveBeenCalled();
    expect(notifyApproversOfReport).not.toHaveBeenCalled();
  });
});

describe('SubmissionReportService.listForSubmission', () => {
  const target = { id: SUBMISSION_ID, ownerId: OWNER_ID };

  it('shows an admin every report, with the contact email', async () => {
    reports.listBySubmission.mockResolvedValueOnce([report()]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([]);

    await expect(SubmissionReportService.listForSubmission(target, admin)).resolves.toEqual([
      {
        id: REPORT_ID,
        reason: 'NOT_THEIRS',
        note: 'That is my photo.',
        createdAt: FILED,
        handled: false,
        handledAt: null,
        handledByUsername: null,
        hasContact: true,
        contactEmail: 'wronged@example.com',
      },
    ]);
  });

  it('shows a manager that a contact was left, never the address', async () => {
    reports.listBySubmission.mockResolvedValueOnce([report()]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([]);

    const listed = await SubmissionReportService.listForSubmission(target, manager);

    expect(listed?.map(({ hasContact, contactEmail }) => ({ hasContact, contactEmail }))).toEqual([
      { hasContact: true, contactEmail: null },
    ]);
  });

  it('says no contact was left when the report holds none', async () => {
    reports.listBySubmission.mockResolvedValueOnce([report({ contactEmail: null })]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([]);

    const listed = await SubmissionReportService.listForSubmission(target, admin);

    expect(listed?.map(({ hasContact, contactEmail }) => ({ hasContact, contactEmail }))).toEqual([
      { hasContact: false, contactEmail: null },
    ]);
  });

  it('names the approver who handled a report', async () => {
    reports.listBySubmission.mockResolvedValueOnce([
      report({ handled: true, handledAt: NOW, handledBy: OTHER_ID }),
      report({ id: 'f'.repeat(24), handled: true, handledAt: NOW, handledBy: OTHER_ID }),
    ]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([
      { id: OTHER_ID, username: 'boss' },
    ]);

    const listed = await SubmissionReportService.listForSubmission(target, admin);

    expect(listed?.map(({ handledByUsername }) => handledByUsername)).toEqual(['boss', 'boss']);
    expect(vi.mocked(UserRepository.findUsernamesByIds).mock.calls).toEqual([[[OTHER_ID]]]);
  });

  it('leaves the name empty for an approver who no longer has an account', async () => {
    reports.listBySubmission.mockResolvedValueOnce([
      report({ handled: true, handledAt: NOW, handledBy: OTHER_ID }),
    ]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([]);

    const listed = await SubmissionReportService.listForSubmission(target, admin);

    expect(listed?.map(({ handledByUsername }) => handledByUsername)).toEqual([null]);
  });

  it('does not show a manager the reports against their own submission', async () => {
    await expect(
      SubmissionReportService.listForSubmission(target, owningManager)
    ).resolves.toBeNull();
    expect(reports.listBySubmission).not.toHaveBeenCalled();
  });

  it('shows an admin the reports against their own submission', async () => {
    reports.listBySubmission.mockResolvedValueOnce([report()]);
    vi.mocked(UserRepository.findUsernamesByIds).mockResolvedValueOnce([]);

    const listed = await SubmissionReportService.listForSubmission(target, owningAdmin);

    expect(listed).toHaveLength(1);
  });
});

describe('SubmissionReportService.markHandled', () => {
  const target = {
    id: REPORT_ID,
    handled: false,
    submissionId: SUBMISSION_ID,
    submission: { ownerId: OWNER_ID },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the report handled by this approver, now', async () => {
    reports.findTarget.mockResolvedValueOnce(target);
    reports.markHandled.mockResolvedValueOnce(true);

    await SubmissionReportService.markHandled(manager, REPORT_ID);

    expect(reports.markHandled.mock.calls).toEqual([[REPORT_ID, { by: OTHER_ID, at: NOW }]]);
  });

  it('hands back the submission the report is on', async () => {
    reports.findTarget.mockResolvedValueOnce(target);
    reports.markHandled.mockResolvedValueOnce(true);

    await expect(SubmissionReportService.markHandled(manager, REPORT_ID)).resolves.toEqual({
      submissionId: SUBMISSION_ID,
    });
  });

  it('succeeds quietly when another approver handled it first', async () => {
    reports.findTarget.mockResolvedValueOnce({ ...target, handled: true });
    reports.markHandled.mockResolvedValueOnce(false);

    await expect(SubmissionReportService.markHandled(manager, REPORT_ID)).resolves.toEqual({
      submissionId: SUBMISSION_ID,
    });
  });

  it('refuses a report that does not exist', async () => {
    reports.findTarget.mockResolvedValueOnce(null);

    await expect(SubmissionReportService.markHandled(manager, REPORT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Report not found.',
    });
    expect(reports.markHandled).not.toHaveBeenCalled();
  });

  it('refuses a manager handling a report on their own submission, as if it did not exist', async () => {
    reports.findTarget.mockResolvedValueOnce(target);

    await expect(
      SubmissionReportService.markHandled(owningManager, REPORT_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Report not found.' });
    expect(reports.markHandled).not.toHaveBeenCalled();
  });

  it('lets an admin handle a report on their own submission', async () => {
    reports.findTarget.mockResolvedValueOnce(target);
    reports.markHandled.mockResolvedValueOnce(true);

    await SubmissionReportService.markHandled(owningAdmin, REPORT_ID);

    expect(reports.markHandled.mock.calls).toEqual([[REPORT_ID, { by: OWNER_ID, at: NOW }]]);
  });
});

describe('SubmissionReportService.listReported', () => {
  const second = 'f'.repeat(24);
  const groups = [
    { submissionId: second, openReports: 1, oldestReportAt: FILED },
    { submissionId: SUBMISSION_ID, openReports: 3, oldestReportAt: NOW },
  ];

  it('lists the reported submissions in the order of their oldest open report', async () => {
    reports.listReportedSubmissions.mockResolvedValueOnce({ groups, total: 2 });
    // The rows arrive in no promised order.
    vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mockResolvedValueOnce([
      submission(),
      submission({ id: second, title: 'Second', status: 'AWAITING_APPROVAL' }, { username: null }),
    ]);

    await expect(
      SubmissionReportService.listReported(admin, { skip: 0, take: 25 })
    ).resolves.toEqual({
      rows: [
        {
          id: second,
          title: 'Second',
          category: 'WRITING',
          status: 'AWAITING_APPROVAL',
          ownerUsername: null,
          openReports: 1,
          oldestReportAt: FILED,
        },
        {
          id: SUBMISSION_ID,
          title: 'Bus poem',
          category: 'WRITING',
          status: 'APPROVED',
          ownerUsername: 'fan',
          openReports: 3,
          oldestReportAt: NOW,
        },
      ],
      total: 2,
    });
    expect(vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mock.calls).toEqual([
      [[second, SUBMISSION_ID]],
    ]);
  });

  it('reads every reported submission for an admin', async () => {
    reports.listReportedSubmissions.mockResolvedValueOnce({ groups: [], total: 0 });
    vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mockResolvedValueOnce([]);

    await SubmissionReportService.listReported(owningAdmin, { skip: 25, take: 25 });

    expect(reports.listReportedSubmissions.mock.calls).toEqual([[{ skip: 25, take: 25 }]]);
  });

  it('leaves a manager’s own submissions out of what they read', async () => {
    reports.listReportedSubmissions.mockResolvedValueOnce({ groups: [], total: 0 });
    vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mockResolvedValueOnce([]);

    await SubmissionReportService.listReported(owningManager, { skip: 0, take: 25 });

    expect(reports.listReportedSubmissions.mock.calls).toEqual([
      [{ skip: 0, take: 25, exceptOwnerId: OWNER_ID }],
    ]);
  });

  it('drops a group whose submission was deleted between the two reads', async () => {
    reports.listReportedSubmissions.mockResolvedValueOnce({ groups, total: 2 });
    vi.mocked(SubmissionRepository.findManyWithOwnerByIds).mockResolvedValueOnce([submission()]);

    const { rows } = await SubmissionReportService.listReported(admin, { skip: 0, take: 25 });

    expect(rows.map(({ id }) => id)).toEqual([SUBMISSION_ID]);
  });
});

describe('SubmissionReportService.countReported', () => {
  it('counts every reported submission for an admin', async () => {
    reports.countReportedSubmissions.mockResolvedValueOnce(4);

    await expect(SubmissionReportService.countReported(owningAdmin)).resolves.toBe(4);
    expect(reports.countReportedSubmissions.mock.calls).toEqual([[undefined]]);
  });

  it('leaves a manager’s own submissions out of their count', async () => {
    reports.countReportedSubmissions.mockResolvedValueOnce(3);

    await expect(SubmissionReportService.countReported(owningManager)).resolves.toBe(3);
    expect(reports.countReportedSubmissions.mock.calls).toEqual([[OWNER_ID]]);
  });
});

describe('SubmissionReportService.countOpen', () => {
  it('counts every open report', async () => {
    reports.countOpen.mockResolvedValueOnce(6);

    await expect(SubmissionReportService.countOpen()).resolves.toBe(6);
  });
});

describe('SubmissionReportService.eraseExpiredContacts', () => {
  it('erases the contacts on reports filed more than the retention period before now', async () => {
    reports.eraseContactsFiledBefore.mockResolvedValueOnce(2);

    const erased = await SubmissionReportService.eraseExpiredContacts(NOW);

    expect(erased).toBe(2);
    expect(reports.eraseContactsFiledBefore.mock.calls).toEqual([
      [new Date('2026-08-14T12:00:00.000Z')],
    ]);
  });

  it('keeps a contact for 90 days', () => {
    expect(REPORT_CONTACT_RETENTION_DAYS).toBe(90);
  });
});
