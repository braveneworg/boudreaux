/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { viewKeyFor } from '@/lib/community/view-key';
import type * as SubmissionWhere from '@/lib/repositories/_internal/submission-where';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { SubmissionViewEventRepository } from '@/lib/repositories/submission-view-event-repository';
import type { SubmissionStandingRecord } from '@/lib/types/domain/submission';
import { allowGuestView } from '@/lib/utils/submission-view-allowance';

import { SubmissionViewEventService, type ViewAttempt } from './submission-view-event-service';

vi.mock('server-only', () => ({}));
// The repository is stubbed; the rule for "public" is the real one, so a
// change to it reaches these cases.
vi.mock('@/lib/repositories/submission-repository', async () => {
  const { isPublicSubmission } = await vi.importActual<typeof SubmissionWhere>(
    '@/lib/repositories/_internal/submission-where'
  );

  return { SubmissionRepository: { findStanding: vi.fn() }, isPublicSubmission };
});
vi.mock('@/lib/repositories/submission-view-event-repository', () => ({
  SubmissionViewEventRepository: { record: vi.fn(), exists: vi.fn(), deleteBefore: vi.fn() },
}));
vi.mock('@/lib/utils/submission-view-allowance', () => ({ allowGuestView: vi.fn() }));

const SUBMISSION_ID = 'c'.repeat(24);
const OWNER_ID = 'a'.repeat(24);
const READER_ID = 'b'.repeat(24);
const VISITOR_ID = '0b0f6d0e-8c0f-4d0f-9d0f-0d0f0d0f0d0f';
const NOW = new Date('2026-11-14T23:30:00.000Z');
const DAY = '2026-11-14';

const standing = vi.mocked(SubmissionRepository.findStanding);
const record = vi.mocked(SubmissionViewEventRepository.record);
const exists = vi.mocked(SubmissionViewEventRepository.exists);
const deleteBefore = vi.mocked(SubmissionViewEventRepository.deleteBefore);
const allow = vi.mocked(allowGuestView);
const resolveGuest = vi.fn<() => Promise<string>>();

const approved: SubmissionStandingRecord = {
  ownerId: OWNER_ID,
  status: 'APPROVED',
  owner: { banned: null },
};

// Clearly fake, and as long as the real secret's floor.
const SECRET = 'view-service-spec-secret-not-a-secret-00';

const userKey = viewKeyFor({
  submissionId: SUBMISSION_ID,
  viewer: { kind: 'user', id: READER_ID },
  day: DAY,
  secret: SECRET,
});
const guestKey = viewKeyFor({
  submissionId: SUBMISSION_ID,
  viewer: { kind: 'guest', id: VISITOR_ID },
  day: DAY,
  secret: SECRET,
});

const attempt = (overrides: Partial<ViewAttempt> = {}): ViewAttempt => ({
  submissionId: SUBMISSION_ID,
  viewer: null,
  resolveGuest,
  address: '203.0.113.7',
  now: NOW,
  ...overrides,
});

const reader = { id: READER_ID, role: 'user' };

// A queued answer a case never reached must not answer the next one.
beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', SECRET);
  standing.mockReset();
  record.mockReset();
  exists.mockReset();
  deleteBefore.mockReset();
  allow.mockReset();
  resolveGuest.mockReset();
});

describe('SubmissionViewEventService.record', () => {
  describe('what is never counted', () => {
    it('counts nothing for an id that names no submission', async () => {
      standing.mockResolvedValueOnce(null);

      await expect(SubmissionViewEventService.record(attempt())).resolves.toBe(false);
      expect(record.mock.calls).toEqual([]);
    });

    it.each([
      ['a draft', { ...approved, status: 'DRAFT' }],
      ['one awaiting approval', { ...approved, status: 'AWAITING_APPROVAL' }],
      ['a rejected one', { ...approved, status: 'REJECTED' }],
      ['a banned owner’s', { ...approved, owner: { banned: true } }],
    ] as const)('counts nothing for %s', async (_name, row) => {
      standing.mockResolvedValueOnce(row);

      await expect(SubmissionViewEventService.record(attempt({ viewer: reader }))).resolves.toBe(
        false
      );
      expect(record.mock.calls).toEqual([]);
    });

    it('does not ask who a guest is when the submission is not public', async () => {
      standing.mockResolvedValueOnce({ ...approved, status: 'DRAFT' });

      await SubmissionViewEventService.record(attempt());

      expect(resolveGuest.mock.calls).toEqual([]);
    });

    it('counts nothing for the owner’s own opening', async () => {
      standing.mockResolvedValueOnce(approved);

      await expect(
        SubmissionViewEventService.record(attempt({ viewer: { id: OWNER_ID, role: 'user' } }))
      ).resolves.toBe(false);
      expect(record.mock.calls).toEqual([]);
    });

    it.each(['admin', 'manager'])('counts nothing for an approver’s opening (%s)', async (role) => {
      standing.mockResolvedValueOnce(approved);

      await expect(
        SubmissionViewEventService.record(attempt({ viewer: { id: READER_ID, role } }))
      ).resolves.toBe(false);
      expect(record.mock.calls).toEqual([]);
    });
  });

  describe('a signed-in viewer', () => {
    it('is counted under the key of the account, the submission and the UTC day', async () => {
      standing.mockResolvedValueOnce(approved);
      record.mockResolvedValueOnce(true);

      await expect(SubmissionViewEventService.record(attempt({ viewer: reader }))).resolves.toBe(
        true
      );
      expect(record.mock.calls).toEqual([
        [{ submissionId: SUBMISSION_ID, viewKey: userKey, viewedAt: NOW }],
      ]);
    });

    it('is not counted twice on one day: the answer is the write’s', async () => {
      standing.mockResolvedValueOnce(approved);
      record.mockResolvedValueOnce(false);

      await expect(SubmissionViewEventService.record(attempt({ viewer: reader }))).resolves.toBe(
        false
      );
    });

    it('is counted under a new key on the next UTC day', async () => {
      standing.mockResolvedValueOnce(approved);
      record.mockResolvedValueOnce(true);

      await SubmissionViewEventService.record(
        attempt({ viewer: reader, now: new Date('2026-11-15T00:00:00.000Z') })
      );

      expect(record.mock.calls[0]?.[0].viewKey).toBe(
        viewKeyFor({
          submissionId: SUBMISSION_ID,
          viewer: { kind: 'user', id: READER_ID },
          day: '2026-11-15',
          secret: SECRET,
        })
      );
    });

    it('fails, and stores nothing, when the server has no secret to key the view under', async () => {
      vi.stubEnv('AUTH_SECRET', '');
      standing.mockResolvedValueOnce(approved);

      await expect(SubmissionViewEventService.record(attempt({ viewer: reader }))).rejects.toThrow(
        'AUTH_SECRET'
      );
      expect(record.mock.calls).toEqual([]);
    });

    it('is not asked for a guest identity and spends no address allowance', async () => {
      standing.mockResolvedValueOnce(approved);
      record.mockResolvedValueOnce(true);

      await SubmissionViewEventService.record(attempt({ viewer: reader }));

      expect(resolveGuest.mock.calls).toEqual([]);
      expect(allow.mock.calls).toEqual([]);
    });
  });

  describe('a guest', () => {
    it('is counted under the key of the visitor, the submission and the UTC day', async () => {
      standing.mockResolvedValueOnce(approved);
      resolveGuest.mockResolvedValueOnce(VISITOR_ID);
      exists.mockResolvedValueOnce(false);
      allow.mockResolvedValueOnce(true);
      record.mockResolvedValueOnce(true);

      await expect(SubmissionViewEventService.record(attempt())).resolves.toBe(true);
      expect(record.mock.calls).toEqual([
        [{ submissionId: SUBMISSION_ID, viewKey: guestKey, viewedAt: NOW }],
      ]);
    });

    it('is not identified, and nothing is stored, when the server has no secret', async () => {
      vi.stubEnv('AUTH_SECRET', '');
      standing.mockResolvedValueOnce(approved);

      await expect(SubmissionViewEventService.record(attempt())).rejects.toThrow('AUTH_SECRET');
      expect(resolveGuest.mock.calls).toEqual([]);
    });

    it('spends the address’s allowance for that submission', async () => {
      standing.mockResolvedValueOnce(approved);
      resolveGuest.mockResolvedValueOnce(VISITOR_ID);
      exists.mockResolvedValueOnce(false);
      allow.mockResolvedValueOnce(true);
      record.mockResolvedValueOnce(true);

      await SubmissionViewEventService.record(attempt({ address: '::ffff:203.0.113.7' }));

      expect(allow.mock.calls).toEqual([
        [{ addressKey: '203.0.113.7', submissionId: SUBMISSION_ID }],
      ]);
    });

    it('already counted today spends nothing and writes nothing', async () => {
      standing.mockResolvedValueOnce(approved);
      resolveGuest.mockResolvedValueOnce(VISITOR_ID);
      exists.mockResolvedValueOnce(true);

      await expect(SubmissionViewEventService.record(attempt())).resolves.toBe(false);
      expect(exists.mock.calls).toEqual([[guestKey]]);
      expect(allow.mock.calls).toEqual([]);
      expect(record.mock.calls).toEqual([]);
    });

    it('is not counted once the address’s allowance is spent', async () => {
      standing.mockResolvedValueOnce(approved);
      resolveGuest.mockResolvedValueOnce(VISITOR_ID);
      exists.mockResolvedValueOnce(false);
      allow.mockResolvedValueOnce(false);

      await expect(SubmissionViewEventService.record(attempt())).resolves.toBe(false);
      expect(record.mock.calls).toEqual([]);
    });

    it('who loses a race for the key is not counted: the answer is the write’s', async () => {
      standing.mockResolvedValueOnce(approved);
      resolveGuest.mockResolvedValueOnce(VISITOR_ID);
      exists.mockResolvedValueOnce(false);
      allow.mockResolvedValueOnce(true);
      record.mockResolvedValueOnce(false);

      await expect(SubmissionViewEventService.record(attempt())).resolves.toBe(false);
    });
  });
});

describe('SubmissionViewEventService.prune', () => {
  it('deletes the views that no longer count: those from over thirty days ago', async () => {
    deleteBefore.mockResolvedValueOnce(4);

    await expect(SubmissionViewEventService.prune(NOW)).resolves.toBe(4);
    expect(deleteBefore.mock.calls).toEqual([[new Date('2026-10-15T23:30:00.000Z')]]);
  });
});
