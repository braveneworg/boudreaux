/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { createVideoDraftAction } from '@/lib/actions/create-video-draft-action';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoDraft } from './use-video-draft';

import type { UseFormReturn } from 'react-hook-form';

vi.mock('@/lib/actions/create-video-draft-action', () => ({
  createVideoDraftAction: vi.fn(),
}));

const ID = '507f1f77bcf86cd799439011';

/** Build a real RHF form seeded with the uploaded triple + category. */
const buildForm = (
  overrides: Partial<VideoFormData> = {}
): { current: UseFormReturn<VideoFormData> } => {
  const { result } = renderHook(() =>
    useForm<VideoFormData>({
      defaultValues: {
        s3Key: 'media/videos/x/clip.mp4',
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        category: 'MUSIC',
        title: '',
        artist: '',
        ...overrides,
      },
    })
  );
  return result;
};

describe('useVideoDraft', () => {
  it('creates the draft from a form snapshot and swaps the URL', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const historySpy = vi.spyOn(globalThis.history, 'replaceState');
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    expect(createVideoDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({ preGeneratedId: ID, s3Key: 'media/videos/x/clip.mp4' })
    );
    expect(historySpy).toHaveBeenCalledWith(null, '', `/admin/videos/${ID}`);
  });

  it('includes non-empty optional fields and artist details in the snapshot', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm({ title: 'My Clip', artist: 'The Artist' });
    const details = [{ sourceName: 'The Artist', firstName: 'The' }];

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => details,
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    expect(createVideoDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Clip', artist: 'The Artist', artistDetails: details })
    );
  });

  it('omits empty optional fields and empty artist details from the snapshot', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    const payload = vi.mocked(createVideoDraftAction).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('artistDetails');
  });

  it('never fires in edit mode', () => {
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: true,
        getArtistDetails: () => [],
      })
    );

    act(() => result.current.handleUploadComplete());

    expect(createVideoDraftAction).not.toHaveBeenCalled();
  });

  it('creates the draft only once across two rapid calls', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
      })
    );

    act(() => {
      result.current.handleUploadComplete();
      result.current.handleUploadComplete();
    });

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    expect(createVideoDraftAction).toHaveBeenCalledTimes(1);
  });

  it('keeps create mode with no URL swap when the draft fails', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: false, error: 'boom' });
    const historySpy = vi.spyOn(globalThis.history, 'replaceState');
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(createVideoDraftAction).toHaveBeenCalledTimes(1));
    expect(result.current.draftId).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('degrades silently and stays in create mode when the action throws', async () => {
    vi.mocked(createVideoDraftAction).mockRejectedValue(new Error('network down'));
    const historySpy = vi.spyOn(globalThis.history, 'replaceState');
    const form = buildForm();

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(createVideoDraftAction).toHaveBeenCalledTimes(1));
    expect(result.current.draftId).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();
  });
});
