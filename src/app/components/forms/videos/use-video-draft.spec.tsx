/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { createVideoDraftAction } from '@/lib/actions/create-video-draft-action';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoDraft } from './use-video-draft';

import type { UseFormReturn } from 'react-hook-form';

vi.mock('@/lib/actions/create-video-draft-action', () => ({
  createVideoDraftAction: vi.fn(),
}));

const ID = '507f1f77bcf86cd799439011';

const posterFields: { posterUrl: string; posterCandidates: VideoPosterCandidate[] } = {
  posterUrl: 'https://cdn.example.com/media/videos/vid1/poster-candidate-2.jpg',
  posterCandidates: [
    {
      url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
      atSeconds: 3.7,
      score: 12,
    },
    {
      url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-2.jpg',
      atSeconds: 6.5,
      score: 15,
    },
  ],
};

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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
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
        getPosterFields: async () => ({}),
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(createVideoDraftAction).toHaveBeenCalledTimes(1));
    expect(result.current.draftId).toBeNull();
    expect(historySpy).not.toHaveBeenCalled();
  });

  it('awaits getPosterFields before creating the draft and sends the fields with it', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm();
    const callOrder: string[] = [];
    const getPosterFields = vi.fn(async () => {
      callOrder.push('getPosterFields');
      return posterFields;
    });
    vi.mocked(createVideoDraftAction).mockImplementation(async () => {
      callOrder.push('createVideoDraftAction');
      return { success: true, videoId: ID };
    });

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
        getPosterFields,
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    expect(callOrder).toEqual(['getPosterFields', 'createVideoDraftAction']);
    expect(createVideoDraftAction).toHaveBeenCalledWith(expect.objectContaining(posterFields));
  });

  it('writes the draft posterUrl into the form without dirtying', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm();
    const setValueSpy = vi.spyOn(form.current, 'setValue');

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
        getPosterFields: async () => posterFields,
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    expect(setValueSpy).toHaveBeenCalledWith('posterUrl', posterFields.posterUrl, {
      shouldDirty: false,
    });
  });

  it('sends no poster fields and never touches posterUrl when getPosterFields resolves empty', async () => {
    vi.mocked(createVideoDraftAction).mockResolvedValue({ success: true, videoId: ID });
    const form = buildForm();
    const setValueSpy = vi.spyOn(form.current, 'setValue');

    const { result } = renderHook(() =>
      useVideoDraft({
        form: form.current,
        preGeneratedId: ID,
        isEditMode: false,
        getArtistDetails: () => [],
        getPosterFields: async () => ({}),
      })
    );

    act(() => result.current.handleUploadComplete());

    await waitFor(() => expect(result.current.draftId).toBe(ID));
    const payload = vi.mocked(createVideoDraftAction).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('posterUrl');
    expect(payload).not.toHaveProperty('posterCandidates');
    expect(setValueSpy).not.toHaveBeenCalledWith('posterUrl', expect.anything(), expect.anything());
  });
});
