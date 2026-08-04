/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import { useVideoPosterStrip, type UseVideoPosterStripResult } from './use-video-poster-strip';

import type { PosterCandidate } from './video-metadata';
import type { UseFormReturn } from 'react-hook-form';

const mocks = vi.hoisted(() => ({
  startUploads: vi.fn(),
  getSettledAligned: vi.fn(),
  selectVideoPosterAsync: vi.fn(),
  /** Mutable stand-in for the uploads hook's index-aligned state. */
  alignedNow: [] as (VideoPosterCandidate | null)[],
}));

vi.mock('./use-poster-candidate-uploads', () => ({
  usePosterCandidateUploads: () => ({
    startUploads: mocks.startUploads,
    alignedNow: mocks.alignedNow,
    getSettledAligned: mocks.getSettledAligned,
  }),
}));

vi.mock('@/hooks/mutations/use-video-mutations', () => ({
  useSelectVideoPosterMutation: () => ({
    selectVideoPoster: vi.fn(),
    selectVideoPosterAsync: mocks.selectVideoPosterAsync,
    isSelectingVideoPoster: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const VIDEO_ID = '507f1f77bcf86cd799439011';
const MANUAL_POSTER_URL = 'https://cdn.example.com/media/videos/vid1/manual.jpg';

/** A freshly captured frame; the blob content doubles as its identity. */
const captured = (atSeconds: number, score: number): PosterCandidate => ({
  blob: new Blob([`frame-${atSeconds}`], { type: 'image/jpeg' }),
  atSeconds,
  score,
});

/** The uploaded twin of a captured frame, as it lands in `alignedNow`/the row. */
const uploaded = (index: number, atSeconds: number, score: number): VideoPosterCandidate => ({
  url: `https://cdn.example.com/media/videos/vid1/poster-candidate-${index}.jpg`,
  atSeconds,
  score,
});

const CAPTURED = [captured(3.7, 4), captured(5.1, 9), captured(6.5, 2)];
const UPLOADED = [uploaded(1, 3.7, 4), uploaded(2, 5.1, 9), uploaded(3, 6.5, 2)];

interface RenderStripOptions {
  isPersisted?: boolean;
  effectiveVideoId?: string;
  /** Seeds the form's `posterUrl`; omitted leaves the field unset entirely. */
  posterUrl?: string;
  storedCandidates?: VideoPosterCandidate[];
  onPosterPersisted?: () => void;
}

interface StripHarness {
  strip: UseVideoPosterStripResult;
  form: UseFormReturn<VideoFormData>;
  /** Read during render — RHF's `formState` only tracks what a render subscribes to. */
  isDirty: boolean;
}

/** A video row carrying only the fields the strip hook reads. */
const videoRowWith = (posterCandidates: VideoPosterCandidate[] | undefined): VideoRow | null =>
  posterCandidates ? ({ id: VIDEO_ID, posterCandidates } as unknown as VideoRow) : null;

/**
 * Drive the hook alongside a real RHF form in one component — exactly how
 * `VideoForm` wires it, so `useWatch('posterUrl')` sees optimistic writes.
 */
const renderStrip = ({
  isPersisted = false,
  effectiveVideoId,
  posterUrl,
  storedCandidates,
  onPosterPersisted,
}: RenderStripOptions = {}): { current: StripHarness } => {
  const { result } = renderHook(() => {
    const form = useForm<VideoFormData>({ defaultValues: { posterUrl } });
    const strip = useVideoPosterStrip({
      form,
      video: videoRowWith(storedCandidates),
      isPersisted,
      effectiveVideoId,
      preGeneratedId: VIDEO_ID,
      onPosterPersisted,
    });
    return { form, strip, isDirty: form.formState.isDirty };
  });
  return result;
};

beforeEach(() => {
  mocks.alignedNow = [];
  mocks.getSettledAligned.mockResolvedValue([]);
  mocks.selectVideoPosterAsync.mockResolvedValue({ success: true });
});

describe('useVideoPosterStrip — fresh capture', () => {
  it('shows the captured frames as the strip candidates', () => {
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));

    expect(harness.current.strip.stripCandidates).toEqual(CAPTURED);
  });

  it('pre-selects the sharpest captured frame', () => {
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));

    expect(harness.current.strip.selectedIndex).toBe(1);
  });

  it('starts the candidate upload fan-out for the captured set', () => {
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));

    expect(mocks.startUploads).toHaveBeenCalledWith(CAPTURED);
  });

  it('exposes the selected frame blob for the Save-time fallback', () => {
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.strip.selectedPosterBlob).toBe(CAPTURED[2].blob);
  });
});

describe('useVideoPosterStrip — selecting before a row exists', () => {
  it('moves the local selection', () => {
    const harness = renderStrip({ isPersisted: false });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.strip.selectedIndex).toBe(2);
  });

  it('never calls the select-poster mutation', () => {
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: false });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(2));

    expect(mocks.selectVideoPosterAsync).not.toHaveBeenCalled();
  });

  it('never persists a frame whose upload has not landed yet', () => {
    mocks.alignedNow = [];
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(2));

    expect(mocks.selectVideoPosterAsync).not.toHaveBeenCalled();
  });

  it('never persists without a resolved row id', async () => {
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: undefined });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(mocks.selectVideoPosterAsync).not.toHaveBeenCalled();
  });
});

describe('useVideoPosterStrip — selecting after a row exists', () => {
  it('writes the picked candidate URL into the form optimistically', async () => {
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.form.getValues('posterUrl')).toBe(UPLOADED[2].url);
  });

  it('persists the pick through the select-poster mutation', async () => {
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(mocks.selectVideoPosterAsync).toHaveBeenCalledWith({
      videoId: VIDEO_ID,
      candidateUrl: UPLOADED[2].url,
    });
  });

  it('leaves the optimistic pick in place and confirms it on success', async () => {
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Poster updated.');
  });

  it('reverts the optimistic poster when the mutation reports failure', async () => {
    mocks.alignedNow = UPLOADED;
    mocks.selectVideoPosterAsync.mockResolvedValue({ success: false, error: 'boom' });
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      posterUrl: MANUAL_POSTER_URL,
    });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.form.getValues('posterUrl')).toBe(MANUAL_POSTER_URL);
  });

  it('clears the optimistic poster on failure when the form had none', async () => {
    mocks.alignedNow = UPLOADED;
    mocks.selectVideoPosterAsync.mockResolvedValue({ success: false, error: 'boom' });
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.form.getValues('posterUrl')).toBe('');
  });

  it('toasts an error when the mutation reports failure', async () => {
    mocks.alignedNow = UPLOADED;
    mocks.selectVideoPosterAsync.mockResolvedValue({ success: false, error: 'boom' });
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Could not set the poster — try again.');
  });

  it('leaves the form pristine — the optimistic write must not dirty it', async () => {
    // Load-bearing: `VideoForm`'s reset keeps dirty values across a refetch, so
    // a dirtied `posterUrl` would survive (and re-submit) a reverted pick.
    mocks.alignedNow = UPLOADED;
    const harness = renderStrip({ isPersisted: true, effectiveVideoId: VIDEO_ID });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.isDirty).toBe(false);
  });

  it('reverts the optimistic poster when the mutation throws', async () => {
    mocks.alignedNow = UPLOADED;
    mocks.selectVideoPosterAsync.mockRejectedValue(new Error('network down'));
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      posterUrl: MANUAL_POSTER_URL,
    });

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.form.getValues('posterUrl')).toBe(MANUAL_POSTER_URL);
  });
});

describe('useVideoPosterStrip — stored candidates on revisit', () => {
  it('shows the stored candidates as the strip candidates', () => {
    const harness = renderStrip({ storedCandidates: UPLOADED, posterUrl: UPLOADED[1].url });

    expect(harness.current.strip.stripCandidates).toEqual(UPLOADED);
  });

  it('highlights the stored candidate matching the live poster URL', () => {
    const harness = renderStrip({ storedCandidates: UPLOADED, posterUrl: UPLOADED[1].url });

    expect(harness.current.strip.selectedIndex).toBe(1);
  });

  it('highlights nothing when the live poster is a manual upload', () => {
    const harness = renderStrip({ storedCandidates: UPLOADED, posterUrl: MANUAL_POSTER_URL });

    expect(harness.current.strip.selectedIndex).toBe(-1);
  });

  it('offers no Save-time blob when the strip is hydrated from stored candidates', () => {
    const harness = renderStrip({ storedCandidates: UPLOADED, posterUrl: UPLOADED[1].url });

    expect(harness.current.strip.selectedPosterBlob).toBeNull();
  });

  it('renders an empty strip for a video with no stored candidates', () => {
    const harness = renderStrip({ storedCandidates: [], posterUrl: MANUAL_POSTER_URL });

    expect(harness.current.strip.stripCandidates).toEqual([]);
  });

  it('writes the picked stored URL into the form optimistically', async () => {
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      storedCandidates: UPLOADED,
      posterUrl: UPLOADED[1].url,
    });

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.form.getValues('posterUrl')).toBe(UPLOADED[2].url);
  });

  it('follows the persisted poster URL with the highlight', async () => {
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      storedCandidates: UPLOADED,
      posterUrl: UPLOADED[1].url,
    });

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(harness.current.strip.selectedIndex).toBe(2);
  });

  it('persists a stored pick through the select-poster mutation', async () => {
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      storedCandidates: UPLOADED,
      posterUrl: UPLOADED[1].url,
    });

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(mocks.selectVideoPosterAsync).toHaveBeenCalledWith({
      videoId: VIDEO_ID,
      candidateUrl: UPLOADED[2].url,
    });
  });

  it('toasts success after a stored pick persists', async () => {
    const harness = renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      storedCandidates: UPLOADED,
      posterUrl: UPLOADED[1].url,
    });

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Poster updated.');
  });
});

describe('useVideoPosterStrip — persisted-pick notification', () => {
  /** A session manual poster is live, so the caller must be told to drop it. */
  const renderWithCallback = (onPosterPersisted: () => void): { current: StripHarness } =>
    renderStrip({
      isPersisted: true,
      effectiveVideoId: VIDEO_ID,
      storedCandidates: UPLOADED,
      posterUrl: MANUAL_POSTER_URL,
      onPosterPersisted,
    });

  it('notifies the caller once a pick has persisted', async () => {
    const onPosterPersisted = vi.fn();
    const harness = renderWithCallback(onPosterPersisted);

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(onPosterPersisted).toHaveBeenCalledTimes(1);
  });

  it('never notifies the caller when the persist fails', async () => {
    mocks.selectVideoPosterAsync.mockResolvedValue({ success: false, error: 'boom' });
    const onPosterPersisted = vi.fn();
    const harness = renderWithCallback(onPosterPersisted);

    await act(async () => harness.current.strip.handleSelectCandidate(2));

    expect(onPosterPersisted).not.toHaveBeenCalled();
  });
});

describe('useVideoPosterStrip — draft poster fields', () => {
  it('sends every surviving uploaded candidate', async () => {
    mocks.getSettledAligned.mockResolvedValue([UPLOADED[0], null, UPLOADED[2]]);
    const harness = renderStrip();

    const fields = await harness.current.strip.getPosterDraftFields();

    expect(fields.posterCandidates).toEqual([UPLOADED[0], UPLOADED[2]]);
  });

  it('sends the selected frame as the draft poster URL', async () => {
    mocks.getSettledAligned.mockResolvedValue([UPLOADED[0], null, UPLOADED[2]]);
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(0));
    const fields = await harness.current.strip.getPosterDraftFields();

    expect(fields.posterUrl).toBe(UPLOADED[0].url);
  });

  it('sends no poster URL when the selected frame failed to upload', async () => {
    mocks.getSettledAligned.mockResolvedValue([UPLOADED[0], null, UPLOADED[2]]);
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(1));
    const fields = await harness.current.strip.getPosterDraftFields();

    expect(fields).not.toHaveProperty('posterUrl');
  });

  it('still lists the survivors when the selected frame failed to upload', async () => {
    mocks.getSettledAligned.mockResolvedValue([UPLOADED[0], null, UPLOADED[2]]);
    const harness = renderStrip();

    act(() => harness.current.strip.handlePosterCandidates(CAPTURED));
    act(() => harness.current.strip.handleSelectCandidate(1));
    const fields = await harness.current.strip.getPosterDraftFields();

    expect(fields.posterCandidates).toEqual([UPLOADED[0], UPLOADED[2]]);
  });

  it('sends nothing when no candidate upload survived', async () => {
    mocks.getSettledAligned.mockResolvedValue([null, null]);
    const harness = renderStrip();

    const fields = await harness.current.strip.getPosterDraftFields();

    expect(fields).toEqual({});
  });
});
