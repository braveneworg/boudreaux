/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const findByReleaseAndFormatMock = vi.fn();
const updateTrackCountsMock = vi.fn();
const findAllByFormatIdMock = vi.fn();
const deleteAllByFormatIdMock = vi.fn();
const deleteS3ObjectMock = vi.fn();

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class MockFormatRepo {
    findByReleaseAndFormat = findByReleaseAndFormatMock;
    updateTrackCounts = updateTrackCountsMock;
  },
}));

vi.mock('@/lib/repositories/release-digital-format-file-repository', () => ({
  ReleaseDigitalFormatFileRepository: class MockFileRepo {
    findAllByFormatId = findAllByFormatIdMock;
    deleteAllByFormatId = deleteAllByFormatIdMock;
  },
}));

vi.mock('@/lib/utils/s3-client', () => ({ deleteS3Object: deleteS3ObjectMock }));

const { deleteFormatFilesAction } = await import('./delete-format-files-action');

describe('deleteFormatFilesAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    findByReleaseAndFormatMock.mockReset();
    updateTrackCountsMock.mockReset();
    findAllByFormatIdMock.mockReset();
    deleteAllByFormatIdMock.mockReset();
    deleteS3ObjectMock.mockReset();
  });

  it('rejects when the caller is not an admin', async () => {
    requireRoleMock.mockRejectedValue(new Error('forbidden'));
    await expect(
      deleteFormatFilesAction({ releaseId: '507f1f77bcf86cd799439011', formatType: 'FLAC' })
    ).rejects.toThrow('forbidden');
    expect(findByReleaseAndFormatMock).not.toHaveBeenCalled();
  });

  it('rejects malformed release IDs before touching the repository', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    const result = await deleteFormatFilesAction({
      releaseId: 'not-an-objectid',
      formatType: 'FLAC',
    });
    expect(result).toEqual({ success: false, error: 'Invalid release ID' });
    expect(findByReleaseAndFormatMock).not.toHaveBeenCalled();
  });

  it('rejects unknown format types before touching the repository', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    const result = await deleteFormatFilesAction({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'EXE' as never,
    });
    expect(result).toEqual({ success: false, error: 'Invalid format type' });
    expect(findByReleaseAndFormatMock).not.toHaveBeenCalled();
  });

  it('returns failure when the format is not found', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    findByReleaseAndFormatMock.mockResolvedValue(null);
    const result = await deleteFormatFilesAction({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'FLAC',
    });
    expect(result).toEqual({
      success: false,
      error: 'Digital format not found for this release',
    });
  });

  it('deletes S3 objects and DB rows and resets format counts', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    findByReleaseAndFormatMock.mockResolvedValue({ id: 'fmt1' });
    findAllByFormatIdMock.mockResolvedValue([{ s3Key: 'a/b.flac' }, { s3Key: 'c/d.flac' }]);
    deleteS3ObjectMock.mockResolvedValue(undefined);
    deleteAllByFormatIdMock.mockResolvedValue(2);
    updateTrackCountsMock.mockResolvedValue(undefined);

    const result = await deleteFormatFilesAction({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'FLAC',
    });
    expect(result).toEqual({ success: true, data: { deletedCount: 2 } });
    expect(deleteS3ObjectMock).toHaveBeenCalledTimes(2);
    expect(deleteAllByFormatIdMock).toHaveBeenCalledWith('fmt1');
    expect(updateTrackCountsMock).toHaveBeenCalledWith('fmt1');
  });

  it('still succeeds if some S3 deletions fail (best-effort)', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    findByReleaseAndFormatMock.mockResolvedValue({ id: 'fmt1' });
    findAllByFormatIdMock.mockResolvedValue([{ s3Key: 'a/b' }, { s3Key: 'c/d' }]);
    deleteS3ObjectMock.mockRejectedValueOnce(new Error('s3 down')).mockResolvedValueOnce(undefined);
    deleteAllByFormatIdMock.mockResolvedValue(2);
    updateTrackCountsMock.mockResolvedValue(undefined);

    const result = await deleteFormatFilesAction({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'FLAC',
    });
    expect(result.success).toBe(true);
  });

  it('skips files without an s3Key', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    findByReleaseAndFormatMock.mockResolvedValue({ id: 'fmt1' });
    findAllByFormatIdMock.mockResolvedValue([{ s3Key: '' }, { s3Key: null }, { s3Key: 'x' }]);
    deleteS3ObjectMock.mockResolvedValue(undefined);
    deleteAllByFormatIdMock.mockResolvedValue(1);
    updateTrackCountsMock.mockResolvedValue(undefined);

    await deleteFormatFilesAction({ releaseId: '507f1f77bcf86cd799439011', formatType: 'FLAC' });
    expect(deleteS3ObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteS3ObjectMock).toHaveBeenCalledWith('x');
  });

  it('returns failure when the repository throws', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin' } });
    findByReleaseAndFormatMock.mockRejectedValue(new Error('boom'));
    const result = await deleteFormatFilesAction({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'FLAC',
    });
    expect(result).toEqual({ success: false, error: 'boom' });
  });
});
