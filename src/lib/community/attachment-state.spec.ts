/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  attachmentFailureCopy,
  attachmentFileKeys,
  attachmentStateOf,
  cardPictureOf,
  unreadyAttachmentsMessage,
} from './attachment-state';

import type { AttachmentStateSource } from './attachment-state';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const MINUTE = 60_000;

const ago = (minutes: number): Date => new Date(NOW.getTime() - minutes * MINUTE);

const attachment = (overrides: Partial<AttachmentStateSource> = {}): AttachmentStateSource => ({
  kind: 'IMAGE',
  uploadKey: 'uploads/s/u',
  copyKey: 'copies/s/a/copy.jpg',
  cardKey: 'copies/s/a/card.webp',
  posterKey: null,
  reencodeStatus: 'succeeded',
  reencodeStartedAt: ago(5),
  reencodeError: null,
  ...overrides,
});

const processing = (overrides: Partial<AttachmentStateSource> = {}): AttachmentStateSource =>
  attachment({
    copyKey: null,
    cardKey: null,
    reencodeStatus: 'processing',
    reencodeStartedAt: ago(1),
    ...overrides,
  });

const failed = (error: string | null = 'too-long'): AttachmentStateSource =>
  attachment({ copyKey: null, cardKey: null, reencodeStatus: 'failed', reencodeError: error });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attachmentStateOf', () => {
  it('is ready once the re-encode succeeded and left a copy', () => {
    expect(attachmentStateOf(attachment())).toEqual({ state: 'ready', error: null });
  });

  it('is processing while the job is pending', () => {
    expect(attachmentStateOf(processing({ reencodeStatus: 'pending' })).state).toBe('processing');
  });

  it('is processing while the job is processing', () => {
    expect(attachmentStateOf(processing()).state).toBe('processing');
  });

  it('is failed once the job has run past the stale window', () => {
    expect(attachmentStateOf(processing({ reencodeStartedAt: ago(18) })).state).toBe('failed');
  });

  it('tells the owner a stale job took too long', () => {
    expect(attachmentStateOf(processing({ reencodeStartedAt: ago(18) })).error).toBe(
      'Processing took too long. Remove it and upload it again.'
    );
  });

  it('is failed with the reason the re-encode gave', () => {
    expect(attachmentStateOf(failed('too-long'))).toEqual({
      state: 'failed',
      error: 'This is longer than we accept. A video can be up to 10 minutes.',
    });
  });

  it('is failed when its job never started', () => {
    const neverStarted = attachment({
      copyKey: null,
      reencodeStatus: null,
      reencodeStartedAt: null,
    });

    expect(attachmentStateOf(neverStarted).state).toBe('failed');
  });

  it('is failed when a succeeded job left no copy', () => {
    expect(attachmentStateOf(attachment({ copyKey: null })).state).toBe('failed');
  });
});

describe('attachmentFailureCopy', () => {
  it.each([
    ['too-large', 'This file is larger than we accept for its kind.'],
    ['too-long', 'This is longer than we accept. A video can be up to 10 minutes.'],
    ['unreadable', "We couldn't read this file. It may be damaged."],
    ['unsupported', "We can't use this kind of file."],
  ])('explains %s', (code, copy) => {
    expect(attachmentFailureCopy(code)).toBe(copy);
  });

  it('never shows an owner a reason it does not know', () => {
    expect(attachmentFailureCopy('ENOSPC: no space left on device')).toBe(
      'Something went wrong while processing this file. Remove it and upload it again.'
    );
  });

  it('answers the same for no reason at all', () => {
    expect(attachmentFailureCopy(null)).toBe(
      'Something went wrong while processing this file. Remove it and upload it again.'
    );
  });
});

describe('unreadyAttachmentsMessage', () => {
  it('is null when every attachment is ready', () => {
    expect(unreadyAttachmentsMessage([attachment(), attachment()])).toBeNull();
  });

  it('is null for a submission without attachments', () => {
    expect(unreadyAttachmentsMessage([])).toBeNull();
  });

  it('asks to wait while one is processing', () => {
    expect(unreadyAttachmentsMessage([attachment(), processing()])).toBe(
      'Wait until every attachment has finished processing.'
    );
  });

  it('asks for a failed one to be removed', () => {
    expect(unreadyAttachmentsMessage([attachment(), failed()])).toBe(
      'Remove the attachment that failed, or upload it again.'
    );
  });

  it('names the failure first when one failed and another is processing', () => {
    expect(unreadyAttachmentsMessage([processing(), failed()])).toBe(
      'Remove the attachment that failed, or upload it again.'
    );
  });
});

describe('cardPictureOf', () => {
  const image = attachment({ cardKey: 'copies/s/image/card.webp' });
  const video = attachment({ kind: 'VIDEO', cardKey: 'copies/s/video/card.webp' });
  const audio = attachment({ kind: 'AUDIO', cardKey: null });

  it('is the first image attachment', () => {
    expect(cardPictureOf([audio, video, image])).toBe('copies/s/image/card.webp');
  });

  it('is the first video when there is no image', () => {
    expect(cardPictureOf([audio, video])).toBe('copies/s/video/card.webp');
  });

  it('is none for audio alone', () => {
    expect(cardPictureOf([audio])).toBeNull();
  });

  it('is none for no attachments', () => {
    expect(cardPictureOf([])).toBeNull();
  });

  it('skips an image that is not ready', () => {
    const unready = processing({ kind: 'IMAGE' });

    expect(cardPictureOf([unready, video])).toBe('copies/s/video/card.webp');
  });
});

describe('attachmentFileKeys', () => {
  it('lists every file a re-encode wrote', () => {
    const video = attachment({
      kind: 'VIDEO',
      copyKey: 'copies/s/a/copy.mp4',
      cardKey: 'copies/s/a/card.webp',
      posterKey: 'copies/s/a/poster.jpg',
    });

    expect(attachmentFileKeys(video)).toEqual([
      'copies/s/a/copy.mp4',
      'copies/s/a/card.webp',
      'copies/s/a/poster.jpg',
    ]);
  });

  it('lists nothing for an attachment with no copy yet', () => {
    expect(attachmentFileKeys(processing())).toEqual([]);
  });
});
