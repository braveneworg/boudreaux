/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ATTACHMENT_MAX_AUDIO_SECONDS,
  ATTACHMENT_MAX_VIDEO_SECONDS,
  ATTACHMENT_UPLOAD_LIMIT_BYTES,
  acceptedAttachmentType,
  attachmentCopyPrefix,
  attachmentKindForType,
  attachmentTypeForFileName,
  attachmentUploadPrefix,
  publishedAttachmentKey,
  submissionReencodeCallbackSchema,
  submissionReencodeDataSchema,
  submissionReencodeInputSchema,
  submissionReencodeProgressPostSchema,
} from './submission-reencode';

const SUBMISSION_ID = 'a'.repeat(24);
const ATTACHMENT_ID = 'b'.repeat(24);
const COPY_PREFIX = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/`;

const validInput = {
  task: 'submission-reencode',
  attachmentId: ATTACHMENT_ID,
  kind: 'VIDEO',
  bucket: 'fakefour-submission-uploads',
  uploadKey: `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`,
  copyPrefix: COPY_PREFIX,
  callbackUrl: 'https://example.com/api/community/attachments/x/reencode/callback',
  progressUrl: 'https://example.com/api/community/attachments/x/reencode/progress',
  jobToken: 'token',
  signingKey: 'c'.repeat(64),
};

const validData = {
  kind: 'VIDEO',
  copyKey: `${COPY_PREFIX}copy.mp4`,
  cardKey: `${COPY_PREFIX}card.webp`,
  posterKey: `${COPY_PREFIX}poster.jpg`,
  copyBytes: 1_234_567,
  width: 1280,
  height: 720,
  durationSeconds: 42,
};

describe('upload limits', () => {
  it('allows a photo up to 20 MB', () => {
    expect(ATTACHMENT_UPLOAD_LIMIT_BYTES.IMAGE).toBe(20 * 1024 * 1024);
  });

  it('allows audio up to 50 MB', () => {
    expect(ATTACHMENT_UPLOAD_LIMIT_BYTES.AUDIO).toBe(50 * 1024 * 1024);
  });

  it('allows a video up to 500 MB', () => {
    expect(ATTACHMENT_UPLOAD_LIMIT_BYTES.VIDEO).toBe(500 * 1024 * 1024);
  });

  it('allows a video up to ten minutes', () => {
    expect(ATTACHMENT_MAX_VIDEO_SECONDS).toBe(600);
  });

  it('allows audio up to three hours', () => {
    expect(ATTACHMENT_MAX_AUDIO_SECONDS).toBe(10_800);
  });
});

describe('attachmentKindForType', () => {
  it.each([
    ['image/jpeg', 'IMAGE'],
    ['image/avif', 'IMAGE'],
    ['audio/mpeg', 'AUDIO'],
    ['audio/x-m4a', 'AUDIO'],
    ['video/quicktime', 'VIDEO'],
    ['video/x-matroska', 'VIDEO'],
  ])('reads %s as %s', (contentType, kind) => {
    expect(attachmentKindForType(contentType)).toBe(kind);
  });

  it('ignores case', () => {
    expect(attachmentKindForType('Video/MP4')).toBe('VIDEO');
  });

  it('ignores parameters after the type', () => {
    expect(attachmentKindForType('audio/ogg; codecs=opus')).toBe('AUDIO');
  });

  it.each(['image/heic', 'image/svg+xml', 'application/x-mpegurl', 'text/html', ''])(
    'accepts no kind for %j',
    (contentType) => {
      expect(attachmentKindForType(contentType)).toBeNull();
    }
  );
});

describe('attachmentTypeForFileName', () => {
  it('names the type of an extension a browser leaves untyped', () => {
    expect(attachmentTypeForFileName('Live Set.MKV')).toBe('video/x-matroska');
  });

  it('names the type of a lossless audio file', () => {
    expect(attachmentTypeForFileName('demo.flac')).toBe('audio/flac');
  });

  it('names no type for a file without an extension', () => {
    expect(attachmentTypeForFileName('README')).toBeNull();
  });

  it('names no type for an extension that is not accepted', () => {
    expect(attachmentTypeForFileName('playlist.m3u8')).toBeNull();
  });
});

describe('acceptedAttachmentType', () => {
  it('is the reported type, bare and lower-cased, when that is accepted', () => {
    expect(acceptedAttachmentType('Audio/OGG; codecs=opus', 'take.ogg')).toBe('audio/ogg');
  });

  it('falls back to the name when the browser reported nothing', () => {
    expect(acceptedAttachmentType('', 'set.mkv')).toBe('video/x-matroska');
  });

  it('falls back to the name when the reported type is not accepted', () => {
    expect(acceptedAttachmentType('application/octet-stream', 'demo.flac')).toBe('audio/flac');
  });

  it('is null when neither the type nor the name is accepted', () => {
    expect(acceptedAttachmentType('application/pdf', 'zine.pdf')).toBeNull();
  });
});

describe('attachment keys', () => {
  it('puts an upload under its submission', () => {
    expect(attachmentUploadPrefix(SUBMISSION_ID)).toBe(`uploads/${SUBMISSION_ID}/`);
  });

  it('puts a copy under its submission and attachment', () => {
    expect(attachmentCopyPrefix(SUBMISSION_ID, ATTACHMENT_ID)).toBe(COPY_PREFIX);
  });

  it('derives the published key from the private one', () => {
    expect(publishedAttachmentKey(`${COPY_PREFIX}copy.mp4`)).toBe(
      `media/submissions/${SUBMISSION_ID}/${ATTACHMENT_ID}/copy.mp4`
    );
  });
});

describe('submissionReencodeInputSchema', () => {
  it('accepts a complete invoke payload', () => {
    expect(submissionReencodeInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('refuses an upload key outside the uploads prefix', () => {
    const input = { ...validInput, uploadKey: `media/${SUBMISSION_ID}/file` };

    expect(submissionReencodeInputSchema.safeParse(input).success).toBe(false);
  });

  it('refuses an upload key that climbs out of its prefix', () => {
    const input = { ...validInput, uploadKey: `uploads/${SUBMISSION_ID}/../other` };

    expect(submissionReencodeInputSchema.safeParse(input).success).toBe(false);
  });

  it('refuses a copy prefix outside the copies prefix', () => {
    const input = { ...validInput, copyPrefix: `media/submissions/${SUBMISSION_ID}/` };

    expect(submissionReencodeInputSchema.safeParse(input).success).toBe(false);
  });

  it('refuses a kind it does not know', () => {
    expect(submissionReencodeInputSchema.safeParse({ ...validInput, kind: 'PDF' }).success).toBe(
      false
    );
  });
});

describe('submissionReencodeDataSchema', () => {
  it('accepts a video result', () => {
    expect(submissionReencodeDataSchema.safeParse(validData).success).toBe(true);
  });

  it('accepts an audio result with no picture', () => {
    const data = {
      ...validData,
      kind: 'AUDIO',
      copyKey: `${COPY_PREFIX}copy.mp3`,
      cardKey: null,
      posterKey: null,
      width: null,
      height: null,
    };

    expect(submissionReencodeDataSchema.safeParse(data).success).toBe(true);
  });

  it('refuses a copy key outside the copies prefix', () => {
    const data = { ...validData, copyKey: 'media/videos/copy.mp4' };

    expect(submissionReencodeDataSchema.safeParse(data).success).toBe(false);
  });

  it('refuses a copy with a file name it does not write', () => {
    const data = { ...validData, copyKey: `${COPY_PREFIX}copy.exe` };

    expect(submissionReencodeDataSchema.safeParse(data).success).toBe(false);
  });

  it('refuses an empty copy', () => {
    expect(submissionReencodeDataSchema.safeParse({ ...validData, copyBytes: 0 }).success).toBe(
      false
    );
  });
});

describe('submissionReencodeCallbackSchema', () => {
  it('accepts a success', () => {
    const body = { jobToken: 'token', result: { ok: true, data: validData } };

    expect(submissionReencodeCallbackSchema.safeParse(body).success).toBe(true);
  });

  it('accepts a failure code', () => {
    const body = { jobToken: 'token', result: { ok: false, error: 'too-long' } };

    expect(submissionReencodeCallbackSchema.safeParse(body).success).toBe(true);
  });

  it('refuses a body without a token', () => {
    const body = { result: { ok: false, error: 'failed' } };

    expect(submissionReencodeCallbackSchema.safeParse(body).success).toBe(false);
  });
});

describe('submissionReencodeProgressPostSchema', () => {
  it('accepts a stage with a percentage', () => {
    const body = { jobToken: 'token', stage: 'encoding', percent: 40 };

    expect(submissionReencodeProgressPostSchema.safeParse(body).success).toBe(true);
  });

  it('refuses a stage it does not know', () => {
    const body = { jobToken: 'token', stage: 'thinking' };

    expect(submissionReencodeProgressPostSchema.safeParse(body).success).toBe(false);
  });

  it('refuses a percentage over one hundred', () => {
    const body = { jobToken: 'token', stage: 'encoding', percent: 101 };

    expect(submissionReencodeProgressPostSchema.safeParse(body).success).toBe(false);
  });
});
