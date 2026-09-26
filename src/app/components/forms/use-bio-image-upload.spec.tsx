/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';

import { useBioImageUpload } from './use-bio-image-upload';
import { uploadBioImage } from './utils/upload-bio-image';

vi.mock('./utils/upload-bio-image', () => ({ uploadBioImage: vi.fn() }));

const record = { id: 'img-9', artistId: 'a1', url: 'https://cdn/x.webp' } as ArtistBioImageRecord;
const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const text = new File(['x'], 'notes.txt', { type: 'text/plain' });

const renderUpload = () => {
  const onUploaded = vi.fn();
  const hook = renderHook(() => useBioImageUpload({ artistId: 'a1', onUploaded }));
  return { ...hook, onUploaded };
};

beforeEach(() => {
  vi.mocked(uploadBioImage).mockReset();
});

describe('useBioImageUpload', () => {
  it('starts idle with no error', () => {
    const { result } = renderUpload();
    expect(result.current.isUploading).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it('rejects a non-image file without starting the pipeline', async () => {
    const { result, onUploaded } = renderUpload();

    let ok = true;
    await act(async () => {
      ok = await result.current.upload(text, { alt: null, attribution: '' });
    });

    expect(ok).toBe(false);
    expect(result.current.errorMessage).toMatch(/JPEG, PNG, or WebP/);
    expect(uploadBioImage).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('runs the pipeline with the artist id and the given fields, then reports the row', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: true, data: record });
    const { result, onUploaded } = renderUpload();

    let ok = false;
    await act(async () => {
      ok = await result.current.upload(jpeg, { alt: 'Ceschi on stage', attribution: 'Sam' });
    });

    expect(ok).toBe(true);
    expect(vi.mocked(uploadBioImage).mock.calls).toEqual([
      [jpeg, { artistId: 'a1', alt: 'Ceschi on stage', attribution: 'Sam' }],
    ]);
    expect(vi.mocked(onUploaded).mock.calls).toEqual([[record]]);
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it('keeps the pipeline error and reports nothing on failure', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: false, error: 'S3 refused' });
    const { result, onUploaded } = renderUpload();

    let ok = true;
    await act(async () => {
      ok = await result.current.upload(jpeg, { alt: null, attribution: '' });
    });

    expect(ok).toBe(false);
    expect(result.current.errorMessage).toBe('S3 refused');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('falls back to a generic error when the pipeline gives none', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: false });
    const { result } = renderUpload();

    await act(async () => {
      await result.current.upload(jpeg, { alt: null, attribution: '' });
    });

    expect(result.current.errorMessage).toBe('Failed to upload image');
  });

  it('clears a previous error when a new upload starts', async () => {
    vi.mocked(uploadBioImage)
      .mockResolvedValueOnce({ success: false, error: 'S3 refused' })
      .mockResolvedValueOnce({ success: true, data: record });
    const { result } = renderUpload();

    await act(async () => {
      await result.current.upload(jpeg, { alt: null, attribution: '' });
    });
    expect(result.current.errorMessage).toBe('S3 refused');

    await act(async () => {
      await result.current.upload(jpeg, { alt: null, attribution: '' });
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('is uploading while the pipeline runs and idle once it settles', async () => {
    let resolveUpload: (value: {
      success: boolean;
      data?: ArtistBioImageRecord;
    }) => void = () => {};
    vi.mocked(uploadBioImage).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );
    const { result } = renderUpload();

    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.upload(jpeg, { alt: null, attribution: '' });
    });
    expect(result.current.isUploading).toBe(true);

    await act(async () => {
      resolveUpload({ success: true, data: record });
      await pending;
    });
    expect(result.current.isUploading).toBe(false);
  });
});
