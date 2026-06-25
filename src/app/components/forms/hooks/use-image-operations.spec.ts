/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { type ImageItem } from '@/app/components/ui/image-uploader';
import type { RegisterImageResult } from '@/lib/actions/register-image-actions';

import { useImageOperations } from './use-image-operations';
import { uploadAndRegisterImages } from '../utils/upload-images';

import type * as UploadImagesModule from '../utils/upload-images';

vi.mock('../utils/upload-images', async () => {
  const actual = await vi.importActual<typeof UploadImagesModule>('../utils/upload-images');
  return { ...actual, uploadAndRegisterImages: vi.fn() };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

const uploadAndRegisterMock = vi.mocked(uploadAndRegisterImages);

const reorderAction = vi.fn();
const deleteAction = vi.fn();

const setup = (entityId: string | null = null) =>
  renderHook(() =>
    useImageOperations({
      entityType: 'releases',
      entityId,
      reorderAction,
      deleteAction,
    })
  );

const pendingImage = (id: string): ImageItem => ({
  id,
  preview: 'blob:p',
  file: new File(['x'], `${id}.png`, { type: 'image/png' }),
});

const registered = (id: string, src: string): RegisterImageResult => ({ id, src, sortOrder: 0 });

beforeEach(() => {
  uploadAndRegisterMock.mockReset();
  reorderAction.mockReset();
  deleteAction.mockReset();
});

describe('useImageOperations — initial state', () => {
  it('starts with no images', () => {
    const { result } = setup();

    expect(result.current.images).toEqual([]);
  });

  it('starts with isUploadingImages false', () => {
    const { result } = setup();

    expect(result.current.isUploadingImages).toBe(false);
  });

  it('reports no pending images when empty', () => {
    const { result } = setup();

    expect(result.current.hasPendingImages).toBe(false);
  });
});

describe('useImageOperations — handleImagesChange / hasPendingImages', () => {
  it('replaces the image list', () => {
    const { result } = setup();

    act(() => result.current.handleImagesChange([pendingImage('a')]));

    expect(result.current.images).toHaveLength(1);
  });

  it('flags pending images (file, no uploadedUrl)', () => {
    const { result } = setup();

    act(() => result.current.handleImagesChange([pendingImage('a')]));

    expect(result.current.hasPendingImages).toBe(true);
  });
});

describe('useImageOperations — handleReorder', () => {
  it('marks images as reordered', () => {
    // No entity id: handleReorder flips the flag synchronously and returns
    // without calling the action (which would otherwise need a mocked result).
    const { result } = setup(null);

    act(() => {
      void result.current.handleReorder(['a', 'b']);
    });

    expect(result.current.imagesReordered).toBe(true);
  });

  it('does not call the reorder action when there is no entity id', async () => {
    const { result } = setup(null);

    await act(async () => {
      await result.current.handleReorder(['a', 'b']);
    });

    expect(reorderAction).not.toHaveBeenCalled();
  });

  it('calls the reorder action with the entity id and image ids', async () => {
    reorderAction.mockResolvedValue({ success: true });
    const { result } = setup('rel-1');

    await act(async () => {
      await result.current.handleReorder(['a', 'b']);
    });

    expect(reorderAction).toHaveBeenCalledWith('rel-1', ['a', 'b']);
  });

  it('shows an error toast when the reorder action fails', async () => {
    reorderAction.mockResolvedValue({ success: false, error: 'reorder failed' });
    const { result } = setup('rel-1');

    await act(async () => {
      await result.current.handleReorder(['a', 'b']);
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('reorder failed');
  });
});

describe('useImageOperations — handleDeleteImage', () => {
  it('calls the delete action and returns its result', async () => {
    deleteAction.mockResolvedValue({ success: true });
    const { result } = setup('rel-1');

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.handleDeleteImage('img-1');
    });

    expect(outcome).toEqual({ success: true });
  });

  it('shows an error toast when the delete action fails', async () => {
    deleteAction.mockResolvedValue({ success: false, error: 'delete failed' });
    const { result } = setup('rel-1');

    await act(async () => {
      await result.current.handleDeleteImage('img-1');
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('delete failed');
  });
});

describe('useImageOperations — uploadImages orchestration', () => {
  it('merges the registered results and fires onSuccess on success', async () => {
    const data = [registered('new-1', 'https://cdn/new-1.png')];
    uploadAndRegisterMock.mockResolvedValue({ success: true, data });
    const onSuccess = vi.fn();
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(data);
  });

  it('updates the pending image with the uploaded url on success', async () => {
    const data = [registered('new-1', 'https://cdn/new-1.png')];
    uploadAndRegisterMock.mockResolvedValue({ success: true, data });
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
      });
    });

    expect(result.current.images[0].uploadedUrl).toBe('https://cdn/new-1.png');
  });

  it('shows an error toast and fires onError when the pipeline throws', async () => {
    uploadAndRegisterMock.mockRejectedValue(new Error('upload boom'));
    const onError = vi.fn();
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
        onError,
      });
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('upload boom');
  });

  it('records the error on the pending image when the pipeline throws', async () => {
    uploadAndRegisterMock.mockRejectedValue(new Error('upload boom'));
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
    });

    expect(result.current.images[0].error).toBe('upload boom');
  });

  it('fires onError when the register step reports failure', async () => {
    uploadAndRegisterMock.mockResolvedValue({ success: false, error: 'register failed' });
    const onError = vi.fn();
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
        onError,
      });
    });

    expect(onError).toHaveBeenCalled();
  });

  it('clears isUploadingImages after the upload settles', async () => {
    uploadAndRegisterMock.mockResolvedValue({ success: true, data: [] });
    const { result } = setup('rel-1');
    act(() => result.current.handleImagesChange([pendingImage('temp')]));

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
      });
    });

    expect(result.current.isUploadingImages).toBe(false);
  });

  it('uses the by-index merge strategy when requested', async () => {
    const data = [registered('new-1', 'https://cdn/new-1.png')];
    uploadAndRegisterMock.mockResolvedValue({ success: true, data });
    const { result } = setup('rel-1');
    // One already-uploaded image then one pending image; by-index leaves the
    // pending image (at index 1) unmatched because data only has index 0.
    act(() =>
      result.current.handleImagesChange([
        { id: 'old', preview: 'p', uploadedUrl: 'https://cdn/old.png' },
        pendingImage('temp'),
      ])
    );

    await act(async () => {
      await result.current.uploadImages(result.current.images, 'rel-1', {
        register: vi.fn(),
        onSuccess: vi.fn(),
        mergeStrategy: 'by-index',
      });
    });

    expect(result.current.images[1].id).toBe('temp');
  });

  it('resetImagesReordered clears the reordered flag', async () => {
    // No entity id, so handleReorder only flips the local flag (no action call).
    const { result } = setup(null);
    await act(async () => {
      await result.current.handleReorder(['a']);
    });

    act(() => result.current.resetImagesReordered());

    expect(result.current.imagesReordered).toBe(false);
  });
});
