/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  attachmentProgressSchema,
  confirmAttachmentUploadSchema,
  removeAttachmentSchema,
  requestAttachmentUploadSchema,
} from './submission-attachment-schema';

const SUBMISSION_ID = 'a'.repeat(24);
const ATTACHMENT_ID = 'b'.repeat(24);
const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;

const request = {
  submissionId: SUBMISSION_ID,
  fileName: 'show.jpg',
  contentType: 'image/jpeg',
  fileSize: 1234,
};

describe('requestAttachmentUploadSchema', () => {
  it('accepts a file with a name, a type and a size', () => {
    expect(requestAttachmentUploadSchema.safeParse(request).success).toBe(true);
  });

  it('trims the file name', () => {
    const parsed = requestAttachmentUploadSchema.parse({ ...request, fileName: '  show.jpg ' });

    expect(parsed.fileName).toBe('show.jpg');
  });

  it('refuses an empty file', () => {
    expect(requestAttachmentUploadSchema.safeParse({ ...request, fileSize: 0 }).success).toBe(
      false
    );
  });

  it('refuses a size that is not a whole number of bytes', () => {
    expect(requestAttachmentUploadSchema.safeParse({ ...request, fileSize: 12.5 }).success).toBe(
      false
    );
  });

  it('refuses a file name longer than 200 characters', () => {
    const fileName = `${'a'.repeat(200)}.jpg`;

    expect(requestAttachmentUploadSchema.safeParse({ ...request, fileName }).success).toBe(false);
  });

  it('refuses a submission id that is not an id', () => {
    expect(
      requestAttachmentUploadSchema.safeParse({ ...request, submissionId: 'mine' }).success
    ).toBe(false);
  });
});

describe('confirmAttachmentUploadSchema', () => {
  const confirm = { submissionId: SUBMISSION_ID, uploadKey: UPLOAD_KEY, fileName: 'show.jpg' };

  it('accepts an upload key the app made', () => {
    expect(confirmAttachmentUploadSchema.safeParse(confirm).success).toBe(true);
  });

  it('refuses a key outside the uploads prefix', () => {
    const uploadKey = `media/videos/${SUBMISSION_ID}/file.mp4`;

    expect(confirmAttachmentUploadSchema.safeParse({ ...confirm, uploadKey }).success).toBe(false);
  });
});

describe('removeAttachmentSchema', () => {
  it('accepts an attachment id', () => {
    expect(removeAttachmentSchema.safeParse({ attachmentId: ATTACHMENT_ID }).success).toBe(true);
  });

  it('refuses anything else', () => {
    expect(removeAttachmentSchema.safeParse({ attachmentId: '../x' }).success).toBe(false);
  });
});

describe('attachmentProgressSchema', () => {
  it('accepts a stored checkpoint', () => {
    const stored = { stage: 'encoding', percent: 40, at: '2026-11-11T12:00:00.000Z' };

    expect(attachmentProgressSchema.safeParse(stored).success).toBe(true);
  });

  it('accepts a checkpoint without a percentage', () => {
    const stored = { stage: 'probing', at: '2026-11-11T12:00:00.000Z' };

    expect(attachmentProgressSchema.safeParse(stored).success).toBe(true);
  });

  it('refuses a stage it does not know', () => {
    const stored = { stage: 'thinking', at: '2026-11-11T12:00:00.000Z' };

    expect(attachmentProgressSchema.safeParse(stored).success).toBe(false);
  });

  it('refuses a missing checkpoint', () => {
    expect(attachmentProgressSchema.safeParse(null).success).toBe(false);
  });
});
