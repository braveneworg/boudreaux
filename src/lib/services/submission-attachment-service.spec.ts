/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { submissionReencodeDataSchema } from '@fakefour/job-contract';

import { MAX_SUBMISSION_ATTACHMENTS, UPLOAD_AGREEMENT_VERSION } from '@/lib/constants/submissions';
import { SubmissionAttachmentRepository } from '@/lib/repositories/submission-attachment-repository';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobPayload } from '@/lib/services/job-runner/types';
import { attachmentStore } from '@/lib/services/submission-attachment-store';
import { SubmissionRuleError, SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionRecord } from '@/lib/types/domain/submission';
import type { SubmissionAttachmentRecord } from '@/lib/types/domain/submission-attachment';

import {
  SubmissionAttachmentService,
  submissionReencodeJob,
} from './submission-attachment-service';

import type { ReencodeJobTypes } from './submission-attachment-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/submission-repository', () => ({
  SubmissionRepository: { findById: vi.fn() },
  isPublicSubmission: vi.fn(),
}));
vi.mock('@/lib/repositories/submission-attachment-repository', () => ({
  SubmissionAttachmentRepository: {
    createWithinCap: vi.fn(),
    findById: vi.fn(),
    findWithSubmission: vi.fn(),
    listBySubmission: vi.fn(async () => []),
    remove: vi.fn(async () => undefined),
    markReencodePending: vi.fn(),
    beginReencodeRun: vi.fn(),
    setReencodeJobToken: vi.fn(),
    claimReencodeJobToken: vi.fn(),
    setReencodeProgress: vi.fn(),
    recordReencodeFailed: vi.fn(),
    recordReencoded: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/user-repository', () => ({ UserRepository: {} }));
vi.mock('@/lib/services/submission-notices', () => ({
  notifyApproversOfSubmission: vi.fn(),
  notifyOwnerOfDecision: vi.fn(),
}));
vi.mock('@/lib/services/submission-attachment-store', () => ({
  attachmentStore: {
    isConfigured: vi.fn(() => true),
    bucket: vi.fn(() => 'private-bucket'),
    presignUpload: vi.fn(async () => 'https://signed.example/put'),
    headUpload: vi.fn(),
    deletePrivate: vi.fn(async () => undefined),
    previewUrl: vi.fn(),
    publicUrl: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
  },
}));
vi.mock('@/lib/services/job-runner/job-runner', () => ({
  jobRunner: { trigger: vi.fn(async () => ({ success: true })), run: vi.fn() },
}));

const NOW = new Date('2026-11-11T12:00:00.000Z');
const OWNER_ID = 'a'.repeat(24);
const OTHER_ID = 'b'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const ATTACHMENT_ID = 'e'.repeat(24);
const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;
const COPY_PREFIX = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/`;
const MEGABYTE = 1024 * 1024;
// Built from code points so the source carries no control character itself.
const NUL = String.fromCodePoint(0);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);

const agreed = { id: OWNER_ID, uploadAgreementVersion: UPLOAD_AGREEMENT_VERSION };
const notAgreed = { id: OWNER_ID, uploadAgreementVersion: null };

const submission = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  id: SUBMISSION_ID,
  ownerId: OWNER_ID,
  title: 'The show',
  category: 'PHOTO',
  aboutHtml: '',
  writingHtml: '',
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
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const attachment = (
  overrides: Partial<SubmissionAttachmentRecord> = {}
): SubmissionAttachmentRecord => ({
  id: ATTACHMENT_ID,
  submissionId: SUBMISSION_ID,
  kind: 'IMAGE',
  fileName: 'show.jpg',
  uploadKey: UPLOAD_KEY,
  uploadBytes: 1000,
  uploadType: 'image/jpeg',
  copyKey: `${COPY_PREFIX}copy.jpg`,
  cardKey: `${COPY_PREFIX}card.webp`,
  posterKey: null,
  copyBytes: 500,
  width: 1200,
  height: 800,
  durationSeconds: null,
  reencodeStatus: 'succeeded',
  reencodeError: null,
  reencodeStartedAt: new Date(NOW.getTime() - 60_000),
  reencodeJobToken: null,
  reencodeProgress: null,
  createdAt: NOW,
  ...overrides,
});

const request = (overrides: Partial<{ contentType: string; fileSize: number }> = {}) => ({
  submissionId: SUBMISSION_ID,
  fileName: 'show.jpg',
  contentType: 'image/jpeg',
  fileSize: 1000,
  ...overrides,
});

const confirm = (overrides: Partial<{ uploadKey: string; fileName: string }> = {}) => ({
  submissionId: SUBMISSION_ID,
  uploadKey: UPLOAD_KEY,
  fileName: 'show.jpg',
  ...overrides,
});

/** The failure a rejected promise carried, reduced to what a caller branches on. */
const failureOf = async (
  promise: Promise<unknown>
): Promise<{ code?: string; message?: string }> => {
  try {
    await promise;
    return {};
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    return { code, message };
  }
};

/** A stored upload the next confirm reads. */
const uploaded = (bytes = 1000, contentType = 'image/jpeg'): void => {
  vi.mocked(attachmentStore.headUpload).mockResolvedValueOnce({ bytes, contentType });
};

const owns = (overrides: Partial<SubmissionRecord> = {}): SubmissionRecord => {
  const stored = submission(overrides);
  vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(stored);
  return stored;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv('E2E_MODE', '');
  vi.stubEnv('SUBMISSION_REENCODER_LAMBDA_NAME', 'fakefour-submission-reencoder');
  // A refusal can return before a queued once-value is read; drop what is
  // left so it never answers a later test (the tests run shuffled).
  vi.mocked(SubmissionRepository.findById).mockReset();
  vi.mocked(SubmissionAttachmentRepository.findById).mockReset();
  vi.mocked(SubmissionAttachmentRepository.findWithSubmission).mockReset();
  vi.mocked(SubmissionAttachmentRepository.createWithinCap).mockReset();
  vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockReset();
  vi.mocked(attachmentStore.headUpload).mockReset();
  vi.mocked(attachmentStore.deletePrivate).mockReset();
  vi.mocked(attachmentStore.isConfigured).mockReset();
  vi.spyOn(SubmissionService, 'takeOfflineForAttachmentChange').mockImplementation(
    async (stored) => stored
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SubmissionAttachmentService.requestUpload', () => {
  it('answers a presigned URL and the key it is for', async () => {
    owns();

    await expect(SubmissionAttachmentService.requestUpload(agreed, request())).resolves.toEqual({
      uploadUrl: 'https://signed.example/put',
      uploadKey: expect.stringMatching(/^uploads\/c{24}\/[0-9a-f-]{36}$/),
    });
  });

  it('signs the declared length and the bare type', async () => {
    owns();

    await SubmissionAttachmentService.requestUpload(
      agreed,
      request({ contentType: 'Image/JPEG; charset=binary', fileSize: 4321 })
    );

    expect(vi.mocked(attachmentStore.presignUpload).mock.calls[0]?.[0]).toMatchObject({
      contentType: 'image/jpeg',
      contentLength: 4321,
    });
  });

  it('refuses when the private bucket is not configured', async () => {
    vi.mocked(attachmentStore.isConfigured).mockReturnValueOnce(false);

    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(agreed, request()))
    ).resolves.toEqual({ code: 'UNAVAILABLE', message: 'Uploads are not set up yet.' });
  });

  it('refuses when the re-encode Lambda is not configured', async () => {
    vi.stubEnv('SUBMISSION_REENCODER_LAMBDA_NAME', '');

    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(agreed, request()))
    ).resolves.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('needs no Lambda name under E2E, where the re-encode is faked', async () => {
    vi.stubEnv('SUBMISSION_REENCODER_LAMBDA_NAME', '');
    vi.stubEnv('E2E_MODE', 'true');
    owns();

    await expect(
      SubmissionAttachmentService.requestUpload(agreed, request())
    ).resolves.toBeDefined();
  });

  it('refuses an account without the current upload agreement', async () => {
    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(notAgreed, request()))
    ).resolves.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('is not found for a submission that does not exist', async () => {
    vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(null);

    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(agreed, request()))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is not found for someone else’s submission', async () => {
    owns({ ownerId: OTHER_ID });

    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(agreed, request()))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a type that is not accepted', async () => {
    owns();

    await expect(
      failureOf(
        SubmissionAttachmentService.requestUpload(agreed, request({ contentType: 'image/heic' }))
      )
    ).resolves.toEqual({
      code: 'VALIDATION',
      message: 'That kind of file is not accepted. Add a photo, an audio file or a video.',
    });
  });

  it.each([
    ['image/jpeg', 20, 'A photo can be up to 20 MB.'],
    ['audio/mpeg', 50, 'An audio file can be up to 50 MB.'],
    ['video/mp4', 500, 'A video can be up to 500 MB.'],
  ])('refuses %s over its limit, naming the limit', async (contentType, megabytes, message) => {
    owns();

    await expect(
      failureOf(
        SubmissionAttachmentService.requestUpload(
          agreed,
          request({ contentType, fileSize: megabytes * MEGABYTE + 1 })
        )
      )
    ).resolves.toEqual({ code: 'VALIDATION', message });
  });

  it('accepts a file exactly at its limit', async () => {
    owns();

    await expect(
      SubmissionAttachmentService.requestUpload(agreed, request({ fileSize: 20 * MEGABYTE }))
    ).resolves.toBeDefined();
  });

  it('refuses when the submission already holds ten attachments', async () => {
    owns();
    vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockResolvedValueOnce(
      Array.from({ length: MAX_SUBMISSION_ATTACHMENTS }, () => attachment())
    );

    await expect(
      failureOf(SubmissionAttachmentService.requestUpload(agreed, request()))
    ).resolves.toEqual({
      code: 'LIMIT_EXCEEDED',
      message: 'A submission can have 10 attachments. Remove one to add another.',
    });
  });

  it('signs nothing for a refused request', async () => {
    owns();

    await failureOf(
      SubmissionAttachmentService.requestUpload(agreed, request({ contentType: 'text/html' }))
    );

    expect(attachmentStore.presignUpload).not.toHaveBeenCalled();
  });
});

describe('SubmissionAttachmentService.confirmUpload', () => {
  const created = (): void => {
    vi.mocked(SubmissionAttachmentRepository.createWithinCap).mockResolvedValueOnce({
      status: 'created',
      attachment: attachment({ copyKey: null, cardKey: null, reencodeStatus: null }),
    });
  };

  it('creates the attachment from what was stored, within the cap of ten', async () => {
    owns();
    uploaded(2222, 'image/png');
    created();

    await SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm());

    expect(vi.mocked(SubmissionAttachmentRepository.createWithinCap).mock.calls).toEqual([
      [
        {
          submissionId: SUBMISSION_ID,
          kind: 'IMAGE',
          fileName: 'show.jpg',
          uploadKey: UPLOAD_KEY,
          uploadBytes: 2222,
          uploadType: 'image/png',
        },
        MAX_SUBMISSION_ATTACHMENTS,
      ],
    ]);
  });

  it('answers the new attachment’s id and the submission as it stands', async () => {
    const stored = owns();
    uploaded();
    created();

    await expect(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm())).resolves.toEqual({
      attachmentId: ATTACHMENT_ID,
      submission: stored,
    });
  });

  it('marks the re-encode pending', async () => {
    owns();
    uploaded();
    created();

    await SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm());

    expect(vi.mocked(jobRunner.trigger).mock.calls).toEqual([
      [submissionReencodeJob, ATTACHMENT_ID],
    ]);
  });

  it('keeps only a plain name from the file name it was sent', async () => {
    owns();
    uploaded();
    created();

    await SubmissionAttachmentService.confirmUpload(
      OWNER_ID,
      confirm({ fileName: `..\\secret/${NUL}show${RIGHT_TO_LEFT_OVERRIDE}.jpg` })
    );

    expect(
      vi.mocked(SubmissionAttachmentRepository.createWithinCap).mock.calls[0]?.[0].fileName
    ).toBe('..secretshow.jpg');
  });

  it('names a file whose name was nothing but separators', async () => {
    owns();
    uploaded();
    created();

    await SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm({ fileName: '/\\/' }));

    expect(
      vi.mocked(SubmissionAttachmentRepository.createWithinCap).mock.calls[0]?.[0].fileName
    ).toBe('file');
  });

  it('refuses a key under another submission’s prefix', async () => {
    const uploadKey = `uploads/${'d'.repeat(24)}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm({ uploadKey })))
    ).resolves.toMatchObject({ code: 'INVALID_INPUT' });
    expect(attachmentStore.headUpload).not.toHaveBeenCalled();
  });

  it('is not found for someone else’s submission', async () => {
    owns({ ownerId: OTHER_ID });

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses when nothing was uploaded at the key', async () => {
    owns();
    vi.mocked(attachmentStore.headUpload).mockResolvedValueOnce(null);

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toEqual({
      code: 'INVALID_INPUT',
      message: 'That upload did not arrive. Try the file again.',
    });
  });

  it('refuses, and deletes, an upload stored with a type that is not accepted', async () => {
    owns();
    uploaded(1000, 'text/html');

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toMatchObject({ code: 'VALIDATION' });
    expect(vi.mocked(attachmentStore.deletePrivate).mock.calls).toEqual([[[UPLOAD_KEY]]]);
  });

  it('refuses, and deletes, an upload stored over its kind’s limit', async () => {
    owns();
    uploaded(20 * MEGABYTE + 1);

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toMatchObject({ code: 'VALIDATION', message: 'A photo can be up to 20 MB.' });
    expect(vi.mocked(attachmentStore.deletePrivate).mock.calls).toEqual([[[UPLOAD_KEY]]]);
  });

  it('refuses, and deletes the upload, when the submission is full', async () => {
    owns();
    uploaded();
    vi.mocked(SubmissionAttachmentRepository.createWithinCap).mockResolvedValueOnce({
      status: 'full',
    });

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(vi.mocked(attachmentStore.deletePrivate).mock.calls).toEqual([[[UPLOAD_KEY]]]);
  });

  it('starts no job for a refused confirm', async () => {
    owns();
    vi.mocked(attachmentStore.headUpload).mockResolvedValueOnce(null);

    await failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()));

    expect(jobRunner.trigger).not.toHaveBeenCalled();
  });

  it('takes an approved submission offline before the attachment is created', async () => {
    const stored = owns({ status: 'APPROVED' });
    uploaded();
    created();

    await SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm());

    const takeOffline = vi.mocked(SubmissionService.takeOfflineForAttachmentChange);
    expect(takeOffline.mock.calls).toEqual([[stored]]);
    expect(takeOffline.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(SubmissionAttachmentRepository.createWithinCap).mock.invocationCallOrder[0] ?? -1
    );
  });

  it('answers the submission as taking it offline left it', async () => {
    owns({ status: 'APPROVED' });
    uploaded();
    created();
    const offline = submission({ status: 'AWAITING_APPROVAL' });
    vi.mocked(SubmissionService.takeOfflineForAttachmentChange).mockResolvedValueOnce(offline);

    const result = await SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm());

    expect(result.submission).toBe(offline);
  });

  it('creates nothing when the submission cannot be taken offline', async () => {
    owns({ status: 'APPROVED' });
    uploaded();
    vi.mocked(SubmissionService.takeOfflineForAttachmentChange).mockRejectedValueOnce(
      new SubmissionRuleError('LIMIT_EXCEEDED', 'At the cap.')
    );

    await expect(
      failureOf(SubmissionAttachmentService.confirmUpload(OWNER_ID, confirm()))
    ).resolves.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(SubmissionAttachmentRepository.createWithinCap).not.toHaveBeenCalled();
  });
});

describe('SubmissionAttachmentService.runReencode', () => {
  it('runs the job through the job runner', async () => {
    await SubmissionAttachmentService.runReencode(ATTACHMENT_ID);

    expect(vi.mocked(jobRunner.run).mock.calls).toEqual([
      [submissionReencodeJob, ATTACHMENT_ID, undefined],
    ]);
  });
});

describe('SubmissionAttachmentService.remove', () => {
  const found = (
    overrides: Partial<SubmissionAttachmentRecord> = {},
    of: Partial<SubmissionRecord> = {}
  ): void => {
    const stored = submission(of);
    vi.mocked(SubmissionAttachmentRepository.findWithSubmission).mockResolvedValueOnce({
      ...attachment(overrides),
      submission: { id: stored.id, ownerId: stored.ownerId, status: stored.status },
    });
    vi.mocked(SubmissionRepository.findById).mockResolvedValueOnce(stored);
  };

  it('removes the attachment and moves its submission on', async () => {
    found();

    await SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID);

    expect(vi.mocked(SubmissionAttachmentRepository.remove).mock.calls).toEqual([
      [ATTACHMENT_ID, SUBMISSION_ID],
    ]);
  });

  it('deletes its private files, the upload included', async () => {
    found();

    await SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID);

    expect(vi.mocked(attachmentStore.deletePrivate).mock.calls).toEqual([
      [[`${COPY_PREFIX}copy.jpg`, `${COPY_PREFIX}card.webp`, UPLOAD_KEY]],
    ]);
  });

  it('still succeeds when its files cannot be deleted', async () => {
    found();
    vi.mocked(attachmentStore.deletePrivate).mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('still succeeds when the store rejects with something that is not an error', async () => {
    found();
    vi.mocked(attachmentStore.deletePrivate).mockRejectedValueOnce('throttled');

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('is not found for an attachment that does not exist', async () => {
    vi.mocked(SubmissionAttachmentRepository.findWithSubmission).mockResolvedValueOnce(null);

    await expect(
      failureOf(SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is not found, and removes nothing, for someone else’s attachment', async () => {
    found({}, { ownerId: OTHER_ID });

    await expect(
      failureOf(SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID))
    ).resolves.toMatchObject({ code: 'NOT_FOUND' });
    expect(SubmissionAttachmentRepository.remove).not.toHaveBeenCalled();
  });

  it('refuses while the attachment is processing', async () => {
    found({ copyKey: null, reencodeStatus: 'processing' });

    await expect(
      failureOf(SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID))
    ).resolves.toEqual({
      code: 'INVALID_INPUT',
      message: 'This attachment is still processing. Remove it once it has finished.',
    });
  });

  it('removes an attachment whose job ran past the stale window', async () => {
    found({
      copyKey: null,
      reencodeStatus: 'processing',
      reencodeStartedAt: new Date(NOW.getTime() - 18 * 60_000),
    });

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('removes a failed attachment', async () => {
    found({ copyKey: null, cardKey: null, reencodeStatus: 'failed', reencodeError: 'too-long' });

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('refuses to leave a submission awaiting approval with nothing to show', async () => {
    found({}, { status: 'AWAITING_APPROVAL' });
    vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockResolvedValueOnce([
      attachment(),
    ]);

    await expect(
      failureOf(SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID))
    ).resolves.toEqual({
      code: 'INVALID_INPUT',
      message:
        'A published submission needs something to show. Add another attachment first, or delete the submission.',
    });
  });

  it('removes one of two attachments from a submission awaiting approval', async () => {
    found({}, { status: 'AWAITING_APPROVAL' });
    vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockResolvedValueOnce([
      attachment(),
      attachment({ id: '1'.repeat(24) }),
    ]);

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('removes the only attachment of a published writing that still has its writing', async () => {
    found({}, { status: 'AWAITING_APPROVAL', category: 'WRITING', writingHtml: '<p>A poem.</p>' });
    vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockResolvedValueOnce([
      attachment(),
    ]);

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('removes the last attachment of a draft', async () => {
    found();

    await expect(
      SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID)
    ).resolves.toBeDefined();
  });

  it('takes an approved submission offline before the attachment is removed', async () => {
    found({}, { status: 'APPROVED' });
    vi.mocked(SubmissionAttachmentRepository.listBySubmission).mockResolvedValueOnce([
      attachment(),
      attachment({ id: '1'.repeat(24) }),
    ]);

    await SubmissionAttachmentService.remove(OWNER_ID, ATTACHMENT_ID);

    expect(
      vi.mocked(SubmissionService.takeOfflineForAttachmentChange).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(SubmissionAttachmentRepository.remove).mock.invocationCallOrder[0] ?? -1
    );
  });
});

describe('submissionReencodeJob', () => {
  const payload = (kind: 'IMAGE' | 'AUDIO' | 'VIDEO'): JobPayload<ReencodeJobTypes> => ({
    task: 'submission-reencode',
    attachmentId: ATTACHMENT_ID,
    kind,
    bucket: 'private-bucket',
    uploadKey: UPLOAD_KEY,
    copyPrefix: COPY_PREFIX,
    callbackUrl: 'https://example.com/callback',
    jobToken: 'token',
    signingKey: 'f'.repeat(64),
  });

  it('is the submission re-encode kind', () => {
    expect(submissionReencodeJob.kind).toBe('submission-reencode');
  });

  it('runs on the re-encode Lambda, never the bio generator', () => {
    expect(submissionReencodeJob.functionName?.()).toBe('fakefour-submission-reencoder');
  });

  it('names no function when the Lambda is not configured', () => {
    vi.stubEnv('SUBMISSION_REENCODER_LAMBDA_NAME', '');

    expect(submissionReencodeJob.functionName?.()).toBeUndefined();
  });

  it('answers on the attachment’s callback and progress routes', () => {
    expect([
      submissionReencodeJob.callbackPath(ATTACHMENT_ID),
      submissionReencodeJob.progress?.path(ATTACHMENT_ID),
    ]).toEqual([
      `/api/community/attachments/${ATTACHMENT_ID}/reencode/callback`,
      `/api/community/attachments/${ATTACHMENT_ID}/reencode/progress`,
    ]);
  });

  it('reads the lifecycle columns off the attachment', () => {
    const record = attachment({
      reencodeStatus: 'processing',
      reencodeJobToken: 'token',
      reencodeProgress: { stage: 'encoding' },
    });

    expect(submissionReencodeJob.state(record)).toEqual({
      status: 'processing',
      startedAt: record.reencodeStartedAt,
      error: null,
      jobToken: 'token',
      progress: { stage: 'encoding' },
    });
  });

  it('prepares a request naming the upload and where its copy goes', async () => {
    vi.mocked(SubmissionAttachmentRepository.findById).mockResolvedValueOnce(
      attachment({ kind: 'VIDEO' })
    );

    await expect(submissionReencodeJob.prepare(ATTACHMENT_ID, undefined)).resolves.toEqual({
      ok: true,
      request: {
        task: 'submission-reencode',
        attachmentId: ATTACHMENT_ID,
        kind: 'VIDEO',
        bucket: 'private-bucket',
        uploadKey: UPLOAD_KEY,
        copyPrefix: COPY_PREFIX,
      },
    });
  });

  it('prepares nothing for an attachment that is gone', async () => {
    vi.mocked(SubmissionAttachmentRepository.findById).mockResolvedValueOnce(null);

    await expect(submissionReencodeJob.prepare(ATTACHMENT_ID, undefined)).resolves.toMatchObject({
      ok: false,
    });
  });

  it('stores what a re-encode wrote', async () => {
    const data = {
      kind: 'IMAGE' as const,
      copyKey: `${COPY_PREFIX}copy.jpg`,
      cardKey: `${COPY_PREFIX}card.webp`,
      posterKey: null,
      copyBytes: 500,
      width: 1200,
      height: 800,
      durationSeconds: null,
    };

    await submissionReencodeJob.persist(ATTACHMENT_ID, data, { submissionId: SUBMISSION_ID });

    expect(vi.mocked(SubmissionAttachmentRepository.recordReencoded).mock.calls).toEqual([
      [ATTACHMENT_ID, data],
    ]);
  });

  it('refuses a result that names a file under another attachment', async () => {
    const elsewhere = `copies/${SUBMISSION_ID}/${'9'.repeat(24)}/`;
    const data = {
      kind: 'IMAGE' as const,
      copyKey: `${elsewhere}copy.jpg`,
      cardKey: null,
      posterKey: null,
      copyBytes: 500,
      width: 1200,
      height: 800,
      durationSeconds: null,
    };

    await expect(
      submissionReencodeJob.persist(ATTACHMENT_ID, data, { submissionId: SUBMISSION_ID })
    ).rejects.toThrow('outside its attachment');
    expect(SubmissionAttachmentRepository.recordReencoded).not.toHaveBeenCalled();
  });

  it('records a failure with the reason the re-encode gave', async () => {
    await submissionReencodeJob.recordFailed(ATTACHMENT_ID, 'too-long');

    expect(vi.mocked(SubmissionAttachmentRepository.recordReencodeFailed).mock.calls).toEqual([
      [ATTACHMENT_ID, 'too-long'],
    ]);
  });

  it('hands the submission on to the completion', () => {
    expect(submissionReencodeJob.claimContext(attachment())).toEqual({
      submissionId: SUBMISSION_ID,
    });
  });

  it.each(['IMAGE', 'AUDIO', 'VIDEO'] as const)(
    'fakes a %s result the callback route accepts',
    (kind) => {
      const result = submissionReencodeJob.fake.result(payload(kind));

      expect(result.ok && submissionReencodeDataSchema.safeParse(result.data).success).toBe(true);
    }
  );

  it('fakes a result under the attachment’s own prefix', () => {
    const result = submissionReencodeJob.fake.result(payload('VIDEO'));

    expect(result.ok && result.data.copyKey).toBe(`${COPY_PREFIX}copy.mp4`);
  });

  it('fakes an audio result with no picture', () => {
    const result = submissionReencodeJob.fake.result(payload('AUDIO'));

    expect(result.ok && [result.data.cardKey, result.data.posterKey]).toEqual([null, null]);
  });
});
