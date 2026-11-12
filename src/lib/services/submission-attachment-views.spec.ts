/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SubmissionAttachmentRecord } from '@/lib/types/domain/submission-attachment';

import { attachmentStore } from './submission-attachment-store';
import { attachmentViewsFor, cardPictureUrlFor } from './submission-attachment-views';

vi.mock('server-only', () => ({}));

vi.mock('./submission-attachment-store', () => ({
  attachmentStore: {
    previewUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
    publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  },
}));

const NOW = new Date('2026-11-11T12:00:00.000Z');
const PREFIX = 'copies/s/a/';

const record = (
  overrides: Partial<SubmissionAttachmentRecord> = {}
): SubmissionAttachmentRecord => ({
  id: 'b'.repeat(24),
  submissionId: 'a'.repeat(24),
  kind: 'VIDEO',
  fileName: 'show.mov',
  uploadKey: 'uploads/s/u',
  uploadBytes: 1000,
  uploadType: 'video/quicktime',
  copyKey: `${PREFIX}copy.mp4`,
  cardKey: `${PREFIX}card.webp`,
  posterKey: `${PREFIX}poster.jpg`,
  copyBytes: 500,
  width: 1280,
  height: 720,
  durationSeconds: 42,
  reencodeStatus: 'succeeded',
  reencodeError: null,
  reencodeStartedAt: new Date(NOW.getTime() - 60_000),
  reencodeJobToken: null,
  reencodeProgress: null,
  createdAt: NOW,
  ...overrides,
});

const processing = (): SubmissionAttachmentRecord =>
  record({
    copyKey: null,
    cardKey: null,
    posterKey: null,
    reencodeStatus: 'processing',
    reencodeProgress: { stage: 'encoding', percent: 40, at: NOW.toISOString() },
  });

const owner = { isPublic: false, showFileNames: true };
const everyone = { isPublic: true, showFileNames: false };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(attachmentStore.previewUrl).mockClear();
  vi.mocked(attachmentStore.publicUrl).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attachmentViewsFor', () => {
  it('gives a reader of a submission that is not public signed links', async () => {
    const [view] = await attachmentViewsFor([record()], owner);

    expect(view).toMatchObject({
      url: `https://signed.example/${PREFIX}copy.mp4`,
      cardUrl: `https://signed.example/${PREFIX}card.webp`,
      posterUrl: `https://signed.example/${PREFIX}poster.jpg`,
    });
  });

  it('gives a reader of a public submission CDN addresses', async () => {
    const [view] = await attachmentViewsFor([record()], everyone);

    expect(view).toMatchObject({
      url: `https://cdn.example/${PREFIX}copy.mp4`,
      cardUrl: `https://cdn.example/${PREFIX}card.webp`,
      posterUrl: `https://cdn.example/${PREFIX}poster.jpg`,
    });
  });

  it('signs nothing for a public submission', async () => {
    await attachmentViewsFor([record()], everyone);

    expect(attachmentStore.previewUrl).not.toHaveBeenCalled();
  });

  it('carries what the re-encode measured', async () => {
    const [view] = await attachmentViewsFor([record()], owner);

    expect(view).toMatchObject({
      kind: 'VIDEO',
      state: 'ready',
      width: 1280,
      height: 720,
      durationSeconds: 42,
    });
  });

  it('shows the file name to the owner and approvers', async () => {
    const [view] = await attachmentViewsFor([record()], owner);

    expect(view?.fileName).toBe('show.mov');
  });

  it('keeps the file name from the public', async () => {
    const [view] = await attachmentViewsFor([record()], everyone);

    expect(view?.fileName).toBe('');
  });

  it('has no URLs while the attachment is processing', async () => {
    const [view] = await attachmentViewsFor([processing()], owner);

    expect(view).toMatchObject({ state: 'processing', url: null, cardUrl: null, posterUrl: null });
  });

  it('carries the latest checkpoint while the attachment is processing', async () => {
    const [view] = await attachmentViewsFor([processing()], owner);

    expect(view?.progress).toEqual({ stage: 'encoding', percent: 40, at: NOW.toISOString() });
  });

  it('carries no checkpoint once the attachment is ready', async () => {
    const stale = record({ reencodeProgress: { stage: 'storing', at: NOW.toISOString() } });

    const [view] = await attachmentViewsFor([stale], owner);

    expect(view?.progress).toBeNull();
  });

  it('carries the reason for a failure', async () => {
    const failed = record({ copyKey: null, reencodeStatus: 'failed', reencodeError: 'unreadable' });

    const [view] = await attachmentViewsFor([failed], owner);

    expect(view).toMatchObject({
      state: 'failed',
      error: "We couldn't read this file. It may be damaged.",
    });
  });

  it('shows the public only the attachments that are ready', async () => {
    const views = await attachmentViewsFor([processing(), record()], everyone);

    expect(views.map(({ state }) => state)).toEqual(['ready']);
  });

  it('keeps the upload order', async () => {
    const first = record({ id: '1'.repeat(24) });
    const second = record({ id: '2'.repeat(24) });

    const views = await attachmentViewsFor([first, second], owner);

    expect(views.map(({ id }) => id)).toEqual([first.id, second.id]);
  });
});

describe('cardPictureUrlFor', () => {
  it('is the signed card of a submission that is not public', async () => {
    await expect(cardPictureUrlFor([record()], { isPublic: false })).resolves.toBe(
      `https://signed.example/${PREFIX}card.webp`
    );
  });

  it('is the CDN card of a public submission', async () => {
    await expect(cardPictureUrlFor([record()], { isPublic: true })).resolves.toBe(
      `https://cdn.example/${PREFIX}card.webp`
    );
  });

  it('is none for a submission with no picture', async () => {
    const audio = record({ kind: 'AUDIO', cardKey: null, posterKey: null });

    await expect(cardPictureUrlFor([audio], { isPublic: true })).resolves.toBeNull();
  });
});
