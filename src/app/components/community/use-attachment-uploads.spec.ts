/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';

import {
  confirmAttachmentUploadAction,
  requestAttachmentUploadAction,
} from '@/lib/actions/submission-attachment-actions';
import { putWithProgress } from '@/lib/utils/put-with-progress';

import { useAttachmentUploads } from './use-attachment-uploads';

vi.mock('@/lib/actions/submission-attachment-actions', () => ({
  requestAttachmentUploadAction: vi.fn(),
  confirmAttachmentUploadAction: vi.fn(),
}));
vi.mock('@/lib/utils/put-with-progress', () => ({
  putWithProgress: vi.fn(),
  isUploadAbort: (error: unknown) => error instanceof Error && error.name === 'AbortError',
}));

const SUBMISSION_ID = 'c'.repeat(24);
const ATTACHMENT_ID = 'e'.repeat(24);
const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;
const UPLOAD_URL = 'https://signed.example/put';
const MEGABYTE = 1024 * 1024;

/** A file of `size` bytes without allocating them. */
const fileOf = (name: string, type: string, size = 1000): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const photo = (): File => fileOf('show.jpg', 'image/jpeg');

const onConfirmed = vi.fn();

const render = (heldCount = 0) =>
  renderHook(() => useAttachmentUploads({ submissionId: SUBMISSION_ID, heldCount, onConfirmed }));

/** A promise the test settles by hand, to hold an upload in flight. */
const deferred = (): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
} => {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
};

beforeEach(() => {
  onConfirmed.mockReset();
  vi.mocked(requestAttachmentUploadAction)
    .mockReset()
    .mockResolvedValue({ success: true, data: { uploadUrl: UPLOAD_URL, uploadKey: UPLOAD_KEY } });
  vi.mocked(putWithProgress).mockReset().mockResolvedValue();
  vi.mocked(confirmAttachmentUploadAction)
    .mockReset()
    .mockResolvedValue({ success: true, data: { attachmentId: ATTACHMENT_ID, status: 'DRAFT' } });
});

describe('useAttachmentUploads', () => {
  it('asks where to upload, naming the file’s accepted type and size', async () => {
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(vi.mocked(requestAttachmentUploadAction).mock.calls).toEqual([
      [
        {
          submissionId: SUBMISSION_ID,
          fileName: 'show.jpg',
          contentType: 'image/jpeg',
          fileSize: 1000,
        },
      ],
    ]);
  });

  it('uploads the file to the answered URL with the type that was signed', async () => {
    const file = photo();
    const { result } = render();

    act(() => result.current.add([file]));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(vi.mocked(putWithProgress).mock.calls.at(0)?.slice(0, 2)).toEqual([UPLOAD_URL, file]);
    expect(vi.mocked(putWithProgress).mock.calls.at(0)?.at(2)).toMatchObject({
      contentType: 'image/jpeg',
    });
  });

  it('confirms the upload once it has arrived', async () => {
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(vi.mocked(confirmAttachmentUploadAction).mock.calls).toEqual([
      [{ submissionId: SUBMISSION_ID, uploadKey: UPLOAD_KEY, fileName: 'show.jpg' }],
    ]);
  });

  it('hands on what the confirm answered and clears the upload', async () => {
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(onConfirmed.mock.calls).toEqual([[{ attachmentId: ATTACHMENT_ID, status: 'DRAFT' }]])
    );
    expect(result.current.uploads).toEqual([]);
  });

  it('lists an upload in flight with its progress', async () => {
    const put = deferred();
    vi.mocked(putWithProgress).mockImplementationOnce((_url, _file, { onProgress }) => {
      onProgress?.(0.4);
      return put.promise;
    });
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        { fileName: 'show.jpg', fraction: 0.4, error: null },
      ])
    );
    await act(async () => put.resolve());
  });

  it('uploads a file its browser left untyped as what its name says', async () => {
    const { result } = render();

    act(() => result.current.add([fileOf('set.mkv', '')]));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(vi.mocked(requestAttachmentUploadAction).mock.calls.at(0)?.at(0)).toMatchObject({
      contentType: 'video/x-matroska',
    });
  });

  it('refuses a file of a type that is not accepted, before asking the server', async () => {
    const { result } = render();

    act(() => result.current.add([fileOf('zine.pdf', 'application/pdf')]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        {
          fileName: 'zine.pdf',
          error: 'That kind of file is not accepted. Add a photo, an audio file or a video.',
        },
      ])
    );
    expect(requestAttachmentUploadAction).not.toHaveBeenCalled();
  });

  it('refuses a file over its kind’s limit, naming the limit, before asking the server', async () => {
    const { result } = render();

    act(() => result.current.add([fileOf('huge.jpg', 'image/jpeg', 20 * MEGABYTE + 1)]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([{ error: 'A photo can be up to 20 MB.' }])
    );
    expect(requestAttachmentUploadAction).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal on the file', async () => {
    vi.mocked(requestAttachmentUploadAction).mockResolvedValueOnce({
      success: false,
      error: 'Uploads are not set up yet.',
      code: 'UNAVAILABLE',
    });
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([{ error: 'Uploads are not set up yet.' }])
    );
    expect(putWithProgress).not.toHaveBeenCalled();
  });

  it('shows a failed upload on the file and confirms nothing', async () => {
    vi.mocked(putWithProgress).mockRejectedValueOnce(new Error('The upload was refused (403).'));
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([{ error: 'The upload was refused (403).' }])
    );
    expect(confirmAttachmentUploadAction).not.toHaveBeenCalled();
  });

  it('explains an upload that failed with something that is not an error', async () => {
    vi.mocked(putWithProgress).mockRejectedValueOnce('offline');
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        { error: 'The upload did not finish. Please try again.' },
      ])
    );
  });

  it('leaves the other files alone when one of them fails', async () => {
    const { result } = render();

    act(() =>
      result.current.add([
        fileOf('zine.pdf', 'application/pdf'),
        fileOf('huge.jpg', 'image/jpeg', 20 * MEGABYTE + 1),
      ])
    );

    await waitFor(() =>
      expect(result.current.uploads.map(({ error }) => error)).toEqual([
        'That kind of file is not accepted. Add a photo, an audio file or a video.',
        'A photo can be up to 20 MB.',
      ])
    );
  });

  it('shows a refused confirm on the file', async () => {
    vi.mocked(confirmAttachmentUploadAction).mockResolvedValueOnce({
      success: false,
      error: 'A submission can have 10 attachments. Remove one to add another.',
      code: 'LIMIT_EXCEEDED',
    });
    const { result } = render();

    act(() => result.current.add([photo()]));

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        { error: 'A submission can have 10 attachments. Remove one to add another.' },
      ])
    );
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('aborts an upload that is cancelled and drops it from the list', async () => {
    vi.mocked(putWithProgress).mockImplementationOnce(
      (_url, _file, { signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    const { result } = render();
    act(() => result.current.add([photo()]));
    await waitFor(() => expect(putWithProgress).toHaveBeenCalled());

    act(() => result.current.dismiss(result.current.uploads.at(0)?.localId ?? ''));

    await waitFor(() => expect(result.current.uploads).toEqual([]));
    expect(confirmAttachmentUploadAction).not.toHaveBeenCalled();
  });

  it('dismisses a failed file', async () => {
    const { result } = render();
    act(() => result.current.add([fileOf('zine.pdf', 'application/pdf')]));
    await waitFor(() => expect(result.current.uploads).toHaveLength(1));

    act(() => result.current.dismiss(result.current.uploads.at(0)?.localId ?? ''));

    expect(result.current.uploads).toEqual([]);
  });

  it('takes only as many files as the submission has room for', async () => {
    const { result } = render(9);

    act(() =>
      result.current.add([fileOf('one.jpg', 'image/jpeg'), fileOf('two.jpg', 'image/jpeg')])
    );

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(
      vi.mocked(requestAttachmentUploadAction).mock.calls.map(([input]) => input)
    ).toMatchObject([{ fileName: 'one.jpg' }]);
  });

  it('says so when files were left out for lack of room', () => {
    const { result } = render(9);

    act(() =>
      result.current.add([fileOf('one.jpg', 'image/jpeg'), fileOf('two.jpg', 'image/jpeg')])
    );

    expect(result.current.notice).toBe(
      'A submission can have 10 attachments. Remove one to add another.'
    );
  });

  it('says nothing when every file fitted', () => {
    const { result } = render();

    act(() => result.current.add([photo()]));

    expect(result.current.notice).toBe('');
  });
});
