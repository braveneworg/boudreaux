/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MAX_SUBMISSION_LINKS,
  MAX_UNAPPROVED_SUBMISSIONS,
  SUBMISSION_ABOUT_MAX,
  SUBMISSION_WRITING_MAX,
  UPLOAD_AGREEMENT_VERSION,
} from '@/lib/constants/submissions';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import {
  notifyApproversOfSubmission,
  notifyOwnerOfDecision,
} from '@/lib/services/submission-notices';
import type { SubmissionRecord, SubmissionWithOwnerRecord } from '@/lib/types/domain/submission';
import { gravatarHash } from '@/lib/utils/gravatar-hash';

import { SubmissionService, type SaveSubmissionData } from './submission-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/submission-repository', () => ({
  SubmissionRepository: {
    createWithinCap: vi.fn(),
    findById: vi.fn(),
    findByIdWithOwner: vi.fn(),
    findByOwner: vi.fn(),
    updateOwned: vi.fn(),
    setListed: vi.fn(),
    decide: vi.fn(),
    deleteOwned: vi.fn(),
    listByStatus: vi.fn(),
    countAwaitingBefore: vi.fn(),
    countAwaiting: vi.fn(),
  },
  isPublicSubmission: ({ status, owner }: { status: string; owner: { banned?: boolean | null } }) =>
    status === 'APPROVED' && owner.banned !== true,
}));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { acceptUploadAgreement: vi.fn() },
}));
vi.mock('@/lib/services/submission-notices', () => ({
  notifyApproversOfSubmission: vi.fn(),
  notifyOwnerOfDecision: vi.fn(),
}));

const NOW = new Date('2026-11-11T12:00:00.000Z');
const EARLIER = new Date('2026-11-01T09:00:00.000Z');
const LOADED = '2026-11-10T09:00:00.000Z';
const OWNER_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const HARDENED = 'rel="nofollow noopener noreferrer" target="_blank"';

const agreed = { id: OWNER_ID, uploadAgreementVersion: UPLOAD_AGREEMENT_VERSION };
const notAgreed = { id: OWNER_ID, uploadAgreementVersion: null };

const admin = { id: OTHER_ID, role: 'admin' };
const manager = { id: OTHER_ID, role: 'manager' };

const form = (overrides: Partial<SaveSubmissionData> = {}): SaveSubmissionData => ({
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>Written on the bus.</p>',
  writingHtml: '<p>A poem.</p>',
  links: ['https://example.com/zine'],
  listed: false,
  acceptAgreement: false,
  ...overrides,
});

const record = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  id: SUBMISSION_ID,
  ownerId: OWNER_ID,
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>Written on the bus.</p>',
  writingHtml: '<p>A poem.</p>',
  links: ['https://example.com/zine'],
  listed: false,
  status: 'DRAFT',
  publishedAt: null,
  firstApprovedAt: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...overrides,
});

const withOwner = (
  overrides: Partial<SubmissionRecord> = {},
  owner: Partial<SubmissionWithOwnerRecord['owner']> = {}
): SubmissionWithOwnerRecord => ({
  ...record(overrides),
  owner: { id: OWNER_ID, username: 'fan', email: 'Fan@Example.com', banned: false, ...owner },
});

const written = (overrides: Partial<SubmissionRecord> = {}) => ({
  status: 'written' as const,
  submission: record(overrides),
});

/** The failure a rejected promise carried, reduced to what a caller branches on. */
const failureOf = async (
  promise: Promise<unknown>
): Promise<{ code?: string; field?: string; message?: string }> => {
  try {
    await promise;
    return {};
  } catch (error) {
    const { code, field, message } = error as { code?: string; field?: string; message?: string };
    return { code, field, message };
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SubmissionService.save', () => {
  describe('the upload agreement', () => {
    it('refuses a save from an account that has not accepted it', async () => {
      await expect(
        failureOf(SubmissionService.save(notAgreed, form(), { publish: false }))
      ).resolves.toEqual({
        code: 'INVALID_INPUT',
        field: 'acceptAgreement',
        message: 'Accept the upload agreement to continue.',
      });
      expect(SubmissionRepository.createWithinCap).not.toHaveBeenCalled();
    });

    it('refuses an account that accepted an older version', async () => {
      const outdated = { id: OWNER_ID, uploadAgreementVersion: UPLOAD_AGREEMENT_VERSION - 1 };

      await expect(
        failureOf(SubmissionService.save(outdated, form(), { publish: false }))
      ).resolves.toMatchObject({ code: 'INVALID_INPUT', field: 'acceptAgreement' });
    });

    it('records the acceptance, at this version and moment, when the save carries it', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await SubmissionService.save(notAgreed, form({ acceptAgreement: true }), { publish: false });

      expect(vi.mocked(UserRepository.acceptUploadAgreement).mock.calls).toEqual([
        [OWNER_ID, UPLOAD_AGREEMENT_VERSION, NOW],
      ]);
    });

    it('does not record it again for an account already at this version', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await SubmissionService.save(agreed, form({ acceptAgreement: true }), { publish: false });

      expect(UserRepository.acceptUploadAgreement).not.toHaveBeenCalled();
    });

    it('does not record it when the content is refused', async () => {
      await failureOf(
        SubmissionService.save(notAgreed, form({ acceptAgreement: true, category: 'VIDEO' }), {
          publish: false,
        })
      );

      expect(UserRepository.acceptUploadAgreement).not.toHaveBeenCalled();
    });
  });

  describe('the content rules', () => {
    it('refuses a category that is not open yet', async () => {
      await expect(
        failureOf(SubmissionService.save(agreed, form({ category: 'VIDEO' }), { publish: false }))
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'category' });
    });

    it('stores the sanitized about and writing, never what was sent', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await SubmissionService.save(
        agreed,
        form({
          aboutHtml: '<p onclick="x()">about <a href="https://example.com">link</a></p>',
          writingHtml:
            '<h2>Poem</h2><script>alert(1)</script><p><a href="https://example.com/a">a</a></p>',
          links: [],
        }),
        { publish: false }
      );

      expect(vi.mocked(SubmissionRepository.createWithinCap).mock.calls[0]?.[0]).toMatchObject({
        aboutHtml: '<p>about link</p>',
        writingHtml: `<h2>Poem</h2><p><a href="https://example.com/a" ${HARDENED}>a</a></p>`,
      });
    });

    it('refuses an about whose text is past the limit', async () => {
      const aboutHtml = `<p>${'a'.repeat(SUBMISSION_ABOUT_MAX + 1)}</p>`;

      await expect(
        failureOf(SubmissionService.save(agreed, form({ aboutHtml }), { publish: false }))
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'aboutHtml' });
    });

    it('measures the about as text, so markup does not count', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());
      const aboutHtml = `<p><strong>${'a'.repeat(SUBMISSION_ABOUT_MAX)}</strong></p>`;

      await expect(
        SubmissionService.save(agreed, form({ aboutHtml }), { publish: false })
      ).resolves.toBeDefined();
    });

    it('refuses a writing whose text is past the limit', async () => {
      const writingHtml = `<p>${'a'.repeat(SUBMISSION_WRITING_MAX + 1)}</p>`;

      await expect(
        failureOf(SubmissionService.save(agreed, form({ writingHtml }), { publish: false }))
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'writingHtml' });
    });

    it('counts the links inside the writing toward the ten', async () => {
      const links = Array.from(
        { length: MAX_SUBMISSION_LINKS },
        (_, index) => `https://example.com/${index}`
      );
      const writingHtml = '<p><a href="https://example.com/extra">one more</a></p>';

      await expect(
        failureOf(SubmissionService.save(agreed, form({ links, writingHtml }), { publish: false }))
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'links' });
    });

    it('accepts exactly ten links across the field and the writing', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());
      const links = Array.from(
        { length: MAX_SUBMISSION_LINKS - 1 },
        (_, index) => `https://example.com/${index}`
      );
      const writingHtml = '<p><a href="https://example.com/tenth">tenth</a></p>';

      await expect(
        SubmissionService.save(agreed, form({ links, writingHtml }), { publish: false })
      ).resolves.toBeDefined();
    });

    it('lets a draft be saved with no title and no writing', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await expect(
        SubmissionService.save(agreed, form({ title: '', writingHtml: '' }), { publish: false })
      ).resolves.toBeDefined();
    });

    it('refuses to publish without a title', async () => {
      await expect(
        failureOf(SubmissionService.save(agreed, form({ title: '' }), { publish: true }))
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'title' });
    });

    it('refuses to publish a writing with no text', async () => {
      await expect(
        failureOf(
          SubmissionService.save(agreed, form({ writingHtml: '<p><br /></p>' }), { publish: true })
        )
      ).resolves.toMatchObject({ code: 'VALIDATION', field: 'writingHtml' });
    });
  });

  describe('a new submission', () => {
    it('is created as a draft, within the cap of unapproved submissions', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await SubmissionService.save(agreed, form({ listed: true }), { publish: false });

      expect(vi.mocked(SubmissionRepository.createWithinCap).mock.calls).toEqual([
        [
          {
            ownerId: OWNER_ID,
            title: 'Bus poem',
            category: 'WRITING',
            aboutHtml: '<p>Written on the bus.</p>',
            writingHtml: '<p>A poem.</p>',
            links: ['https://example.com/zine'],
            listed: true,
            status: 'DRAFT',
            publishedAt: null,
          },
          MAX_UNAPPROVED_SUBMISSIONS,
        ],
      ]);
    });

    it('is created awaiting approval, stamped now, when published', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(
        written({ status: 'AWAITING_APPROVAL' })
      );

      await SubmissionService.save(agreed, form(), { publish: true });

      expect(vi.mocked(SubmissionRepository.createWithinCap).mock.calls[0]?.[0]).toMatchObject({
        status: 'AWAITING_APPROVAL',
        publishedAt: NOW,
      });
    });

    it('tells approvers once when it is published', async () => {
      const saved = record({ status: 'AWAITING_APPROVAL' });
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce({
        status: 'written',
        submission: saved,
      });

      await SubmissionService.save(agreed, form(), { publish: true });

      expect(vi.mocked(notifyApproversOfSubmission).mock.calls).toEqual([[saved]]);
    });

    it('tells nobody when it is saved as a draft', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce(written());

      await SubmissionService.save(agreed, form(), { publish: false });

      expect(notifyApproversOfSubmission).not.toHaveBeenCalled();
    });

    it('is refused with LIMIT_EXCEEDED, naming the limit, at the cap', async () => {
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce({ status: 'full' });

      await expect(
        failureOf(SubmissionService.save(agreed, form(), { publish: false }))
      ).resolves.toEqual({
        code: 'LIMIT_EXCEEDED',
        field: undefined,
        message: `You can have ${MAX_UNAPPROVED_SUBMISSIONS} submissions that are not approved yet. Publish one and wait for approval, or delete a draft, to make room.`,
      });
    });

    it('still succeeds when telling approvers fails', async () => {
      const saved = record({ status: 'AWAITING_APPROVAL' });
      vi.mocked(SubmissionRepository.createWithinCap).mockResolvedValueOnce({
        status: 'written',
        submission: saved,
      });
      vi.mocked(notifyApproversOfSubmission).mockRejectedValueOnce(new Error('SES down'));

      await expect(SubmissionService.save(agreed, form(), { publish: true })).resolves.toBe(saved);
    });
  });

  describe('an existing submission', () => {
    const edit = (overrides: Partial<SaveSubmissionData> = {}): SaveSubmissionData =>
      form({ submissionId: SUBMISSION_ID, ...overrides });

    it('is not found when it does not exist', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(null);

      await expect(
        failureOf(SubmissionService.save(agreed, edit(), { publish: false }))
      ).resolves.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('is not found when it is someone else’s', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(record({ ownerId: OTHER_ID }));

      await expect(
        failureOf(SubmissionService.save(agreed, edit(), { publish: false }))
      ).resolves.toMatchObject({ code: 'NOT_FOUND' });
      expect(SubmissionRepository.updateOwned).not.toHaveBeenCalled();
    });

    it.each([
      ['a draft saved again stays a draft', 'DRAFT', false, 'DRAFT'],
      ['a draft published awaits approval', 'DRAFT', true, 'AWAITING_APPROVAL'],
      [
        'one awaiting approval stays there when edited',
        'AWAITING_APPROVAL',
        false,
        'AWAITING_APPROVAL',
      ],
      ['a rejected one saved again stays rejected', 'REJECTED', false, 'REJECTED'],
      ['a rejected one published awaits approval', 'REJECTED', true, 'AWAITING_APPROVAL'],
    ] as const)('%s', async (_name, from, publish, to) => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(record({ status: from }));
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce(written({ status: to }));

      await SubmissionService.save(agreed, edit({ title: 'New title' }), { publish });

      const [target, data, cap] = vi.mocked(SubmissionRepository.updateOwned).mock.calls[0] ?? [];
      expect({ target, status: data?.status, cap }).toEqual({
        target: { id: SUBMISSION_ID, ownerId: OWNER_ID, expected: from },
        status: to,
        cap: undefined,
      });
    });

    it('stamps the publish moment when a draft is published', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(record());
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce(
        written({ status: 'AWAITING_APPROVAL' })
      );

      await SubmissionService.save(agreed, edit(), { publish: true });

      expect(vi.mocked(SubmissionRepository.updateOwned).mock.calls[0]?.[1].publishedAt).toEqual(
        NOW
      );
    });

    it('keeps its place in the queue when edited while awaiting approval', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(
        record({ status: 'AWAITING_APPROVAL', publishedAt: EARLIER })
      );
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce(
        written({ status: 'AWAITING_APPROVAL' })
      );

      await SubmissionService.save(agreed, edit({ title: 'New title' }), { publish: true });

      expect(
        vi.mocked(SubmissionRepository.updateOwned).mock.calls[0]?.[1].publishedAt
      ).toBeUndefined();
      expect(notifyApproversOfSubmission).not.toHaveBeenCalled();
    });

    it.each(['DRAFT', 'REJECTED'] as const)(
      'tells approvers when a %s submission is published',
      async (status) => {
        const saved = record({ status: 'AWAITING_APPROVAL' });
        vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(record({ status }));
        vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce({
          status: 'written',
          submission: saved,
        });

        await SubmissionService.save(agreed, edit(), { publish: true });

        expect(vi.mocked(notifyApproversOfSubmission).mock.calls).toEqual([[saved]]);
      }
    );

    it('answers a save that lost a race as INVALID_INPUT, asking for a reload', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(record());
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce({ status: 'stale' });

      await expect(
        failureOf(SubmissionService.save(agreed, edit(), { publish: false }))
      ).resolves.toEqual({
        code: 'INVALID_INPUT',
        field: undefined,
        message: 'This submission changed while you were editing. Reload it and try again.',
      });
    });
  });

  describe('an approved submission', () => {
    const approved = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord =>
      record({ status: 'APPROVED', firstApprovedAt: EARLIER, approvedAt: EARLIER, ...overrides });
    const edit = (overrides: Partial<SaveSubmissionData> = {}): SaveSubmissionData =>
      form({ submissionId: SUBMISSION_ID, ...overrides });

    it('goes back to awaiting approval, within the cap, when its content changes', async () => {
      const saved = approved({ status: 'AWAITING_APPROVAL' });
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(approved());
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce({
        status: 'written',
        submission: saved,
      });

      await SubmissionService.save(agreed, edit({ title: 'Typo fixed' }), { publish: false });

      const [target, data, cap] = vi.mocked(SubmissionRepository.updateOwned).mock.calls[0] ?? [];
      expect({ target, status: data?.status, publishedAt: data?.publishedAt, cap }).toEqual({
        target: { id: SUBMISSION_ID, ownerId: OWNER_ID, expected: 'APPROVED' },
        status: 'AWAITING_APPROVAL',
        publishedAt: NOW,
        cap: MAX_UNAPPROVED_SUBMISSIONS,
      });
      expect(vi.mocked(notifyApproversOfSubmission).mock.calls).toEqual([[saved]]);
    });

    it.each([
      ['the about', { aboutHtml: '<p>Changed.</p>' }],
      ['the writing', { writingHtml: '<p>Changed.</p>' }],
      ['the links', { links: [] }],
    ])('treats a change to %s as a content change', async (_name, change) => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(approved());
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce(
        written({ status: 'AWAITING_APPROVAL' })
      );

      await SubmissionService.save(agreed, edit(change), { publish: false });

      expect(vi.mocked(SubmissionRepository.updateOwned).mock.calls[0]?.[1].status).toBe(
        'AWAITING_APPROVAL'
      );
    });

    it('is refused with LIMIT_EXCEEDED when the edit would pass the cap', async () => {
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(approved());
      vi.mocked(SubmissionRepository.updateOwned).mockResolvedValueOnce({ status: 'full' });

      await expect(
        failureOf(SubmissionService.save(agreed, edit({ title: 'Typo fixed' }), { publish: false }))
      ).resolves.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    });

    it('stays approved when only the listed choice changed', async () => {
      const listed = approved({ listed: true });
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(approved());
      vi.mocked(SubmissionRepository.setListed).mockResolvedValueOnce(listed);

      await expect(
        SubmissionService.save(agreed, edit({ listed: true }), { publish: false })
      ).resolves.toBe(listed);
      expect(vi.mocked(SubmissionRepository.setListed).mock.calls).toEqual([
        [SUBMISSION_ID, OWNER_ID, true],
      ]);
      expect(SubmissionRepository.updateOwned).not.toHaveBeenCalled();
      expect(notifyApproversOfSubmission).not.toHaveBeenCalled();
    });

    it('writes nothing when nothing changed', async () => {
      const stored = approved();
      vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(stored);

      await expect(SubmissionService.save(agreed, edit(), { publish: true })).resolves.toBe(stored);
      expect(SubmissionRepository.updateOwned).not.toHaveBeenCalled();
      expect(SubmissionRepository.setListed).not.toHaveBeenCalled();
    });
  });
});

describe('SubmissionService.setListed', () => {
  it('switches the owner’s approved submission', async () => {
    const listed = record({ status: 'APPROVED', listed: true });
    vi.mocked(SubmissionRepository.setListed).mockResolvedValueOnce(listed);

    await expect(SubmissionService.setListed(OWNER_ID, SUBMISSION_ID, true)).resolves.toBe(listed);
    expect(vi.mocked(SubmissionRepository.setListed).mock.calls).toEqual([
      [SUBMISSION_ID, OWNER_ID, true],
    ]);
  });

  it('is not found when no approved submission of theirs matched', async () => {
    vi.mocked(SubmissionRepository.setListed).mockResolvedValueOnce(null);

    await expect(
      failureOf(SubmissionService.setListed(OWNER_ID, SUBMISSION_ID, true))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('SubmissionService.delete', () => {
  it('deletes the owner’s submission', async () => {
    vi.mocked(SubmissionRepository.deleteOwned).mockResolvedValueOnce(true);

    await expect(SubmissionService.delete(OWNER_ID, SUBMISSION_ID)).resolves.toBeUndefined();
    expect(vi.mocked(SubmissionRepository.deleteOwned).mock.calls).toEqual([
      [SUBMISSION_ID, OWNER_ID],
    ]);
  });

  it('is not found when nothing of theirs matched', async () => {
    vi.mocked(SubmissionRepository.deleteOwned).mockResolvedValueOnce(false);

    await expect(
      failureOf(SubmissionService.delete(OWNER_ID, SUBMISSION_ID))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('SubmissionService.approve', () => {
  const input = { submissionId: SUBMISSION_ID, loadedUpdatedAt: LOADED };

  it('approves a submission awaiting approval, on the content the approver loaded', async () => {
    const approved = record({ status: 'APPROVED' });
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL' })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(approved);

    await expect(SubmissionService.approve(manager, input)).resolves.toBe(approved);
    expect(vi.mocked(SubmissionRepository.decide).mock.calls).toEqual([
      [
        SUBMISSION_ID,
        { statuses: ['AWAITING_APPROVAL'], updatedAt: new Date(LOADED) },
        { status: 'APPROVED', approvedAt: NOW, approvedBy: OTHER_ID, firstApprovedAt: NOW },
      ],
    ]);
  });

  it('leaves the first approval moment alone on a re-approval', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL', firstApprovedAt: EARLIER })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(record({ status: 'APPROVED' }));

    await SubmissionService.approve(admin, input);

    expect(vi.mocked(SubmissionRepository.decide).mock.calls[0]?.[2]).toEqual({
      status: 'APPROVED',
      approvedAt: NOW,
      approvedBy: OTHER_ID,
    });
  });

  it('tells the owner, with the submission as approved', async () => {
    const approved = record({ status: 'APPROVED' });
    const loaded = withOwner({ status: 'AWAITING_APPROVAL' });
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(loaded);
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(approved);

    await SubmissionService.approve(admin, input);

    expect(vi.mocked(notifyOwnerOfDecision).mock.calls).toEqual([
      [{ ...approved, owner: loaded.owner }],
    ]);
  });

  it('still succeeds when telling the owner fails', async () => {
    const approved = record({ status: 'APPROVED' });
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL' })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(approved);
    vi.mocked(notifyOwnerOfDecision).mockRejectedValueOnce(new Error('SES down'));

    await expect(SubmissionService.approve(admin, input)).resolves.toBe(approved);
  });

  it('is not found when the submission does not exist', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(null);

    await expect(failureOf(SubmissionService.approve(admin, input))).resolves.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it.each(['DRAFT', 'APPROVED', 'REJECTED'] as const)(
    'refuses a %s submission as INVALID_INPUT',
    async (status) => {
      vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
        withOwner({ status })
      );

      await expect(failureOf(SubmissionService.approve(admin, input))).resolves.toMatchObject({
        code: 'INVALID_INPUT',
      });
      expect(SubmissionRepository.decide).not.toHaveBeenCalled();
    }
  );

  it('refuses a manager approving their own submission', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL', ownerId: OTHER_ID })
    );

    await expect(failureOf(SubmissionService.approve(manager, input))).resolves.toEqual({
      code: 'INVALID_INPUT',
      field: undefined,
      message: 'A manager cannot decide on their own submission. Another approver has to.',
    });
    expect(SubmissionRepository.decide).not.toHaveBeenCalled();
  });

  it('lets an admin approve their own submission', async () => {
    const approved = record({ status: 'APPROVED', ownerId: OTHER_ID });
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL', ownerId: OTHER_ID })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(approved);

    await expect(SubmissionService.approve(admin, input)).resolves.toBe(approved);
  });

  it('answers a decision on changed content as DUPLICATE and tells nobody', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'AWAITING_APPROVAL' })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(null);

    await expect(failureOf(SubmissionService.approve(admin, input))).resolves.toEqual({
      code: 'DUPLICATE',
      field: undefined,
      message: 'This submission changed since you opened it. Review it again before deciding.',
    });
    expect(notifyOwnerOfDecision).not.toHaveBeenCalled();
  });
});

describe('SubmissionService.reject', () => {
  const input = {
    submissionId: SUBMISSION_ID,
    loadedUpdatedAt: LOADED,
    reason: 'Not your recording.',
  };

  it.each(['AWAITING_APPROVAL', 'APPROVED'] as const)(
    'rejects a %s submission with the reason',
    async (status) => {
      const rejected = record({ status: 'REJECTED' });
      vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
        withOwner({ status })
      );
      vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(rejected);

      await expect(SubmissionService.reject(manager, input)).resolves.toBe(rejected);
      expect(vi.mocked(SubmissionRepository.decide).mock.calls).toEqual([
        [
          SUBMISSION_ID,
          { statuses: ['AWAITING_APPROVAL', 'APPROVED'], updatedAt: new Date(LOADED) },
          {
            status: 'REJECTED',
            rejectedAt: NOW,
            rejectedBy: OTHER_ID,
            rejectionReason: 'Not your recording.',
          },
        ],
      ]);
    }
  );

  it('tells the owner, with the submission as rejected', async () => {
    const rejected = record({ status: 'REJECTED', rejectionReason: 'Not your recording.' });
    const loaded = withOwner({ status: 'APPROVED' });
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(loaded);
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(rejected);

    await SubmissionService.reject(admin, input);

    expect(vi.mocked(notifyOwnerOfDecision).mock.calls).toEqual([
      [{ ...rejected, owner: loaded.owner }],
    ]);
  });

  it.each(['DRAFT', 'REJECTED'] as const)(
    'refuses a %s submission as INVALID_INPUT',
    async (status) => {
      vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
        withOwner({ status })
      );

      await expect(failureOf(SubmissionService.reject(admin, input))).resolves.toMatchObject({
        code: 'INVALID_INPUT',
      });
    }
  );

  it('refuses a manager rejecting their own submission', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'APPROVED', ownerId: OTHER_ID })
    );

    await expect(failureOf(SubmissionService.reject(manager, input))).resolves.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(SubmissionRepository.decide).not.toHaveBeenCalled();
  });

  it('answers a decision on changed content as DUPLICATE', async () => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(
      withOwner({ status: 'APPROVED' })
    );
    vi.mocked(SubmissionRepository.decide).mockResolvedValueOnce(null);

    await expect(failureOf(SubmissionService.reject(admin, input))).resolves.toMatchObject({
      code: 'DUPLICATE',
    });
  });
});

describe('SubmissionService.getForViewer', () => {
  const owner = { id: OWNER_ID, role: 'user' };
  const stranger = { id: OTHER_ID, role: 'user' };

  const open = async (
    stored: SubmissionWithOwnerRecord | null,
    viewer: { id: string; role: string | null } | null
  ) => {
    vi.mocked(SubmissionRepository.findByIdWithOwner).mockResolvedValueOnce(stored);
    return SubmissionService.getForViewer(SUBMISSION_ID, viewer);
  };

  it('is null when the submission does not exist', async () => {
    await expect(open(null, owner)).resolves.toBeNull();
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REJECTED', 'APPROVED'] as const)(
    'shows the owner their own %s submission',
    async (status) => {
      await expect(open(withOwner({ status }), owner)).resolves.toMatchObject({
        viewer: 'owner',
        status,
      });
    }
  );

  it('hides an approved submission from its own banned owner', async () => {
    await expect(
      open(withOwner({ status: 'APPROVED' }, { banned: true }), owner)
    ).resolves.toBeNull();
  });

  it.each(['AWAITING_APPROVAL', 'REJECTED', 'APPROVED'] as const)(
    'shows an approver a %s submission',
    async (status) => {
      await expect(open(withOwner({ status }), manager)).resolves.toMatchObject({
        viewer: 'approver',
      });
    }
  );

  it('shows an approver an approved submission whose owner is banned', async () => {
    await expect(
      open(withOwner({ status: 'APPROVED' }, { banned: true }), admin)
    ).resolves.toMatchObject({ viewer: 'approver', isPublic: false });
  });

  it('hides someone else’s draft from an approver', async () => {
    await expect(open(withOwner({ status: 'DRAFT' }), admin)).resolves.toBeNull();
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REJECTED'] as const)(
    'hides a %s submission from a signed-in stranger and from a visitor',
    async (status) => {
      await expect(open(withOwner({ status }), stranger)).resolves.toBeNull();
      await expect(open(withOwner({ status }), null)).resolves.toBeNull();
    }
  );

  it.each([true, false])(
    'shows a visitor an approved submission, listed %s or not',
    async (listed) => {
      await expect(open(withOwner({ status: 'APPROVED', listed }), null)).resolves.toMatchObject({
        viewer: 'public',
        isPublic: true,
      });
    }
  );

  it('hides an approved submission from a visitor while its owner is banned', async () => {
    await expect(
      open(withOwner({ status: 'APPROVED' }, { banned: true }), null)
    ).resolves.toBeNull();
  });

  it('carries the avatar hash and never the owner’s email', async () => {
    const view = await open(withOwner({ status: 'APPROVED' }), null);

    expect(view?.owner).toEqual({
      username: 'fan',
      gravatarHash: gravatarHash('Fan@Example.com'),
    });
    expect(JSON.stringify(view)).not.toContain('Example.com');
  });

  it('gives the owner their queue position while it awaits approval', async () => {
    vi.mocked(SubmissionRepository.countAwaitingBefore).mockResolvedValueOnce(3);

    const view = await open(
      withOwner({ status: 'AWAITING_APPROVAL', publishedAt: EARLIER }),
      owner
    );

    expect(view?.queuePosition).toBe(3);
    expect(vi.mocked(SubmissionRepository.countAwaitingBefore).mock.calls).toEqual([[EARLIER]]);
  });

  it('gives an approver no queue position', async () => {
    const view = await open(
      withOwner({ status: 'AWAITING_APPROVAL', publishedAt: EARLIER }),
      admin
    );

    expect(view?.queuePosition).toBeNull();
    expect(SubmissionRepository.countAwaitingBefore).not.toHaveBeenCalled();
  });

  it('treats an approver reading their own submission as its owner', async () => {
    await expect(
      open(withOwner({ status: 'DRAFT', ownerId: OTHER_ID }), admin)
    ).resolves.toMatchObject({ viewer: 'owner' });
  });
});

describe('SubmissionService.listMine', () => {
  it('lists every submission the owner holds', async () => {
    const rows = [record(), record({ status: 'REJECTED' })];
    vi.mocked(SubmissionRepository.findByOwner).mockResolvedValueOnce(rows);

    await expect(SubmissionService.listMine(OWNER_ID)).resolves.toBe(rows);
    expect(vi.mocked(SubmissionRepository.findByOwner).mock.calls).toEqual([[OWNER_ID]]);
  });
});

describe('SubmissionService.listQueue', () => {
  it('lists a state’s queue as rows that carry no owner email', async () => {
    vi.mocked(SubmissionRepository.listByStatus).mockResolvedValueOnce({
      submissions: [withOwner({ status: 'AWAITING_APPROVAL', publishedAt: EARLIER })],
      total: 1,
    });

    const page = await SubmissionService.listQueue('AWAITING_APPROVAL', { skip: 0, take: 25 });

    expect(page).toEqual({
      rows: [
        {
          id: SUBMISSION_ID,
          title: 'Bus poem',
          category: 'WRITING',
          listed: false,
          status: 'AWAITING_APPROVAL',
          ownerUsername: 'fan',
          publishedAt: EARLIER,
          approvedAt: null,
          rejectedAt: null,
          updatedAt: EARLIER,
        },
      ],
      total: 1,
    });
    expect(vi.mocked(SubmissionRepository.listByStatus).mock.calls).toEqual([
      ['AWAITING_APPROVAL', { skip: 0, take: 25 }],
    ]);
  });
});

describe('SubmissionService.countAwaiting', () => {
  it('counts the submissions awaiting approval', async () => {
    vi.mocked(SubmissionRepository.countAwaiting).mockResolvedValueOnce(4);

    await expect(SubmissionService.countAwaiting()).resolves.toBe(4);
  });
});
