/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { formatUpload } from '@/lib/services/format-upload/format-upload';
import { loggers } from '@/lib/utils/logger';

import {
  checkNewReleaseTitleAction,
  confirmFormatUploadAction,
  discardFormatUploadAction,
} from './format-upload-actions';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: vi.fn() }));

vi.mock('@/lib/services/format-upload/format-upload', () => ({
  formatUpload: { checkNewReleaseTitle: vi.fn(), confirm: vi.fn(), discard: vi.fn() },
}));

const RELEASE_ID = '507f1f77bcf86cd799439011';
const KEY = `releases/${RELEASE_ID}/digital-formats/FLAC/1-one.flac`;
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const titleCheck = { releaseId: RELEASE_ID, title: 'New Album' };
const confirmation = {
  releaseId: RELEASE_ID,
  formatType: 'FLAC' as const,
  files: [{ s3Key: KEY, fileName: 'one.flac', fileSize: 100, mimeType: 'audio/flac' }],
};
const discard = { releaseId: RELEASE_ID, formatType: 'FLAC' as const, s3Keys: [KEY] };

const CONFIRMED = {
  releaseId: RELEASE_ID,
  releaseTitle: 'New Album',
  formatId: 'format-1',
  fileCount: 1,
  created: true,
};

beforeEach(() => {
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: 'admin-1', role: 'admin' } } as never,
  });
});

describe.each([
  ['checkNewReleaseTitleAction', () => checkNewReleaseTitleAction(titleCheck)],
  ['confirmFormatUploadAction', () => confirmFormatUploadAction(confirmation)],
  ['discardFormatUploadAction', () => discardFormatUploadAction(discard)],
])('%s', (_name, run) => {
  it('returns the gate refusal and reaches nothing behind it', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await run();

    expect(result).toEqual(REFUSAL);
    expect(vi.mocked(gateAction).mock.calls).toEqual([['admin']]);
    expect(formatUpload.checkNewReleaseTitle).not.toHaveBeenCalled();
    expect(formatUpload.confirm).not.toHaveBeenCalled();
    expect(formatUpload.discard).not.toHaveBeenCalled();
  });
});

describe('checkNewReleaseTitleAction', () => {
  it('refuses a blank title with the copy before the module sees it', async () => {
    const result = await checkNewReleaseTitleAction({ releaseId: RELEASE_ID, title: '   ' });

    expect(result).toEqual({
      success: false,
      error: 'Album name is required to find or create a release',
    });
    expect(formatUpload.checkNewReleaseTitle).not.toHaveBeenCalled();
  });

  it('refuses a release id that is not an ObjectId', async () => {
    const result = await checkNewReleaseTitleAction({ releaseId: 'nope', title: 'New Album' });

    expect(result).toEqual({ success: false, error: 'Invalid release ID' });
  });

  it('passes a free title, trimmed', async () => {
    vi.mocked(formatUpload.checkNewReleaseTitle).mockResolvedValueOnce({
      success: true,
      data: null,
    });

    const result = await checkNewReleaseTitleAction({
      releaseId: RELEASE_ID,
      title: ' New Album ',
    });

    expect(result).toEqual({ success: true, data: null });
    expect(formatUpload.checkNewReleaseTitle).toHaveBeenCalledWith(titleCheck);
  });

  it("answers the module's refusal with its copy", async () => {
    vi.mocked(formatUpload.checkNewReleaseTitle).mockResolvedValueOnce({
      success: false,
      error:
        'A release titled "New Album" already exists. Open it from Releases to upload its formats.',
      code: 'DUPLICATE',
    });

    const result = await checkNewReleaseTitleAction(titleCheck);

    expect(result).toEqual({
      success: false,
      error:
        'A release titled "New Album" already exists. Open it from Releases to upload its formats.',
    });
  });

  it('answers a thrown error with copy', async () => {
    vi.mocked(formatUpload.checkNewReleaseTitle).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(loggers.media, 'error').mockImplementation(() => {});

    const result = await checkNewReleaseTitleAction(titleCheck);

    expect(result).toEqual({ success: false, error: 'Failed to check the release title' });
  });
});

describe('confirmFormatUploadAction', () => {
  it('refuses arguments of the wrong shape before the module sees them', async () => {
    const result = await confirmFormatUploadAction({ ...confirmation, files: [] });

    expect(result).toEqual({ success: false, error: 'At least one file is required' });
    expect(formatUpload.confirm).not.toHaveBeenCalled();
  });

  it('confirms as the admin the gate let through, and revalidates a created Release', async () => {
    vi.mocked(formatUpload.confirm).mockResolvedValueOnce({ success: true, data: CONFIRMED });

    const result = await confirmFormatUploadAction({
      ...confirmation,
      newRelease: { album: ' New Album ' },
    });

    expect(result).toEqual({ success: true, data: CONFIRMED });
    expect(vi.mocked(formatUpload.confirm).mock.calls).toEqual([
      [{ ...confirmation, newRelease: { album: 'New Album' }, userId: 'admin-1' }],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
  });

  it('revalidates nothing when the Release already existed', async () => {
    vi.mocked(formatUpload.confirm).mockResolvedValueOnce({
      success: true,
      data: { ...CONFIRMED, created: false },
    });

    const result = await confirmFormatUploadAction(confirmation);

    expect(result.success).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers the module's refusal with its copy", async () => {
    vi.mocked(formatUpload.confirm).mockResolvedValueOnce({
      success: false,
      error: 'File not found in S3 storage. Upload may have failed.',
      code: 'NOT_FOUND',
    });

    const result = await confirmFormatUploadAction(confirmation);

    expect(result).toEqual({
      success: false,
      error: 'File not found in S3 storage. Upload may have failed.',
    });
  });

  it('answers a thrown error with copy', async () => {
    vi.mocked(formatUpload.confirm).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(loggers.media, 'error').mockImplementation(() => {});

    const result = await confirmFormatUploadAction(confirmation);

    expect(result).toEqual({ success: false, error: 'Failed to confirm upload' });
  });
});

describe('discardFormatUploadAction', () => {
  it('refuses an unknown format type before the module sees it', async () => {
    const result = await discardFormatUploadAction({
      ...discard,
      formatType: 'BOGUS' as never,
    });

    expect(result).toEqual({ success: false, error: expect.stringContaining('Invalid option') });
    expect(formatUpload.discard).not.toHaveBeenCalled();
  });

  it('discards through the module and reports the count', async () => {
    vi.mocked(formatUpload.discard).mockResolvedValueOnce({
      success: true,
      data: { deletedCount: 1 },
    });

    const result = await discardFormatUploadAction(discard);

    expect(result).toEqual({ success: true, data: { deletedCount: 1 } });
    expect(formatUpload.discard).toHaveBeenCalledWith(discard);
  });

  it("answers the module's refusal with its copy", async () => {
    vi.mocked(formatUpload.discard).mockResolvedValueOnce({
      success: false,
      error: 'Database unavailable',
      code: 'UNAVAILABLE',
    });

    const result = await discardFormatUploadAction(discard);

    expect(result).toEqual({ success: false, error: 'Database unavailable' });
  });

  it('answers a thrown error with copy', async () => {
    vi.mocked(formatUpload.discard).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(loggers.media, 'error').mockImplementation(() => {});

    const result = await discardFormatUploadAction(discard);

    expect(result).toEqual({ success: false, error: 'Failed to discard the uploaded files' });
  });
});
