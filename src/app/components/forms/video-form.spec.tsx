/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState } from 'react';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { VideoForm, useVideoProducersPrefill } from '@/app/components/forms/video-form';
import type * as videoMetadata from '@/app/components/forms/videos/video-metadata';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { UseFormSetValue } from 'react-hook-form';

type PosterCandidate = videoMetadata.PosterCandidate;

/** Build a scored candidate whose blob size encodes its identity for assertions. */
const posterCandidate = (content: string, score: number, atSeconds = 3.7): PosterCandidate => ({
  blob: new Blob([content], { type: 'image/jpeg' }),
  atSeconds,
  score,
});

/** The single captured frame most poster tests need. */
const singleCandidate = (): PosterCandidate => posterCandidate('jpeg', 1);

const mocks = vi.hoisted(() => ({
  createVideoAsync: vi.fn(),
  updateVideoAsync: vi.fn(),
  useVideoQuery: vi.fn(),
  useVideoProbePrefillQuery: vi.fn(),
  useVideoProducersQuery: vi.fn(),
  uploadVideoMultipart: vi.fn(),
  extractVideoDuration: vi.fn(),
  extractVideoTags: vi.fn(),
  captureVideoPosterCandidates: vi.fn(),
  getPresignedUploadUrlsAction: vi.fn(),
  uploadFileToS3: vi.fn(),
  push: vi.fn(),
  useVideoArtistReview: vi.fn(),
  buildArtistDetails: vi.fn(),
  updateDraft: vi.fn(),
  useVideoDraft: vi.fn(),
  /** Overridable per-test poster-upload behaviour; default replays the real hook. */
  posterUploadImpl: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/utils/generate-object-id', () => ({
  generateObjectId: () => 'a'.repeat(24),
}));

vi.mock('@/hooks/mutations/use-video-mutations', () => ({
  useCreateVideoMutation: () => ({
    createVideoAsync: mocks.createVideoAsync,
    isCreatingVideo: false,
  }),
  useUpdateVideoMutation: () => ({
    updateVideoAsync: mocks.updateVideoAsync,
    isUpdatingVideo: false,
  }),
  useUnpublishVideoMutation: () => ({
    unpublishVideoAsync: vi.fn().mockResolvedValue({ success: true }),
    isUnpublishingVideo: false,
  }),
}));

vi.mock('./_hooks/use-video-query', () => ({
  useVideoQuery: (id: string, options: unknown) => mocks.useVideoQuery(id, options),
}));

vi.mock('./_hooks/use-video-probe-prefill-query', () => ({
  useVideoProbePrefillQuery: (s3Key: string, videoId: string, options: unknown) =>
    mocks.useVideoProbePrefillQuery(s3Key, videoId, options),
}));

vi.mock('./_hooks/use-video-producers-query', () => ({
  useVideoProducersQuery: (...args: unknown[]) => mocks.useVideoProducersQuery(...args),
}));

vi.mock('./_hooks/use-release-date-lookup-query', () => ({
  useReleaseDateLookupQuery: () => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/utils/multipart-upload', () => ({
  uploadVideoMultipart: mocks.uploadVideoMultipart,
}));

vi.mock('@/app/components/forms/videos/video-metadata', async (importOriginal) => ({
  // Keep the real pure helpers (bestPosterCandidateIndex) — only the file/DOM
  // touching extractors are faked.
  ...(await importOriginal<typeof videoMetadata>()),
  extractVideoDuration: mocks.extractVideoDuration,
  extractVideoTags: mocks.extractVideoTags,
  captureVideoPosterCandidates: mocks.captureVideoPosterCandidates,
}));

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: mocks.getPresignedUploadUrlsAction,
}));

vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: mocks.uploadFileToS3,
}));

// Fake the poster-upload hook that VideoForm now owns. It faithfully replays the
// real hook's contract — delegating to `posterUploadImpl` (which, by default,
// drives the presign + S3 mocks and writes `posterUrl` via setValue) — so the
// existing "Use this frame" / manual-pick assertions keep exercising those
// action mocks, while failure cases can override `posterUploadImpl`.
vi.mock('@/app/components/forms/videos/use-video-poster-upload', () => ({
  useVideoPosterUpload: ({ setValue }: { setValue: UseFormSetValue<VideoFormData> }) => {
    const [uploadedPosterUrl, setUploadedPosterUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const uploadPoster = async (file: File): Promise<void> => {
      setIsUploading(true);
      setErrorMessage(null);
      try {
        await mocks.posterUploadImpl(file, {
          setValue,
          setUploadedPosterUrl,
          setErrorMessage,
        });
      } finally {
        setIsUploading(false);
      }
    };
    return { uploadedPosterUrl, isUploading, errorMessage, uploadPoster };
  },
}));

vi.mock('@/app/components/forms/videos/use-video-artist-review', () => ({
  useVideoArtistReview: (...args: unknown[]) => mocks.useVideoArtistReview(...args),
}));

vi.mock('@/app/components/forms/videos/use-video-draft', () => ({
  useVideoDraft: (...args: unknown[]) => mocks.useVideoDraft(...args),
}));

vi.mock('@/app/components/forms/videos/video-artist-review-section', () => ({
  VideoArtistReviewSection: ({
    entries,
    primarySplitParts,
    onApplySplit,
  }: {
    entries: { sourceName: string }[];
    primarySplitParts: string[] | null;
    onApplySplit: (parts: string[]) => void;
  }) =>
    entries.length > 0 || primarySplitParts ? (
      <div data-testid="video-artist-review-section">
        {entries.map((e) => (
          <span key={e.sourceName}>{e.sourceName}</span>
        ))}
        {primarySplitParts ? (
          <button type="button" onClick={() => onApplySplit(primarySplitParts)}>
            Apply split
          </button>
        ) : null}
      </div>
    ) : null,
}));

vi.mock('@/app/components/forms/videos/video-producers-section', () => ({
  VideoProducersSection: () => <div data-testid="video-producers-section" />,
}));

vi.mock('@/app/components/forms/videos/enrichment/video-enrichment-panel', () => ({
  VideoEnrichmentPanel: ({
    videoId,
    onApplyVideoSuggestion,
  }: {
    videoId: string;
    onApplyVideoSuggestion: (field: string, value: string) => void;
  }) => (
    <div data-testid="video-enrichment-panel" data-video-id={videoId}>
      <button type="button" onClick={() => onApplyVideoSuggestion('releasedOn', '2024-08-08')}>
        Apply enriched date
      </button>
      <button
        type="button"
        onClick={() => onApplyVideoSuggestion('description', 'Enriched description.')}
      >
        Apply enriched description
      </button>
      <button
        type="button"
        onClick={() => onApplyVideoSuggestion('featuredArtist', 'Guest Vocalist')}
      >
        Apply enriched featured artist
      </button>
    </div>
  ),
}));

// A minimal controllable DatePicker so date fields are plain inputs associated
// with their FormLabel (accessible name comes from the label, not aria-label).
vi.mock('@/ui/datepicker', () => ({
  DatePicker: ({
    onSelect,
    fieldName,
    value,
    ...props
  }: {
    onSelect?: (dateString: string, fieldName: string) => void;
    fieldName: string;
    value?: string;
  }) => (
    <input {...props} value={value ?? ''} onChange={(e) => onSelect?.(e.target.value, fieldName)} />
  ),
}));

// ArtistSearchCombobox: renders a labelled text input so existing tests that
// use getByLabelText('Artist / Creator') / toHaveValue / user.type continue
// to work. onChange is called on every keystroke (simulating free-text entry).
vi.mock('@/app/components/forms/fields/artist-search-combobox', () => ({
  ArtistSearchCombobox: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    value: string;
    onChange: (name: string) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label htmlFor="artist-search-input">{label}</label>}
      <input
        id="artist-search-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// FeaturedArtistsCombobox: minimal stub — video-form tests don't exercise
// featured artists directly; the stub keeps the form render free of query deps.
vi.mock('@/app/components/forms/fields/featured-artists-combobox', () => ({
  FeaturedArtistsCombobox: ({
    label,
    value,
    disabled,
  }: {
    label?: string;
    value: string[];
    onChange: (names: string[]) => void;
    disabled?: boolean;
  }) => (
    <div>
      {label && <span>{label}</span>}
      {disabled && <span>Add a primary artist first</span>}
      <span data-testid="featured-artists-value">{value.join(', ')}</span>
    </div>
  ),
}));

const CREATE_MODE_QUERY = {
  data: null,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

const setup = () => userEvent.setup();

const uploadVideoFile = async (
  user: ReturnType<typeof userEvent.setup>,
  name = 'clip.mp4',
  label = 'Choose a video file'
): Promise<File> => {
  const file = new File(['video-bytes'], name, { type: 'video/mp4' });
  await user.upload(screen.getByLabelText(label), file);
  return file;
};

const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText('Title'), 'My Great Video');
  await user.type(screen.getByLabelText('Artist / Creator'), 'The Creator');
  await user.click(screen.getByRole('radio', { name: 'Music' }));
  fireEvent.change(screen.getByLabelText('Release date'), { target: { value: '2024-05-01' } });
};

const PROBE_IDLE_RESULT = { data: undefined, isPending: false, isError: false };

beforeEach(() => {
  mocks.useVideoQuery.mockReturnValue(CREATE_MODE_QUERY);
  mocks.useVideoProbePrefillQuery.mockReturnValue(PROBE_IDLE_RESULT);
  mocks.useVideoProducersQuery.mockReturnValue({
    isPending: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
  });
  mocks.buildArtistDetails.mockReturnValue([]);
  mocks.useVideoArtistReview.mockReturnValue({
    entries: [],
    updateDraft: mocks.updateDraft,
    buildArtistDetails: mocks.buildArtistDetails,
  });
  mocks.useVideoDraft.mockReturnValue({ draftId: null, handleUploadComplete: vi.fn() });
  mocks.createVideoAsync.mockResolvedValue({
    success: true,
    fields: {},
    data: { videoId: 'created-video-id' },
  });
  mocks.updateVideoAsync.mockResolvedValue({ success: true, fields: {}, data: { videoId: 'v1' } });
  mocks.uploadVideoMultipart.mockResolvedValue({
    success: true,
    s3Key: 'media/videos/aaa/clip.mp4',
    fileSize: 2048,
  });
  mocks.extractVideoTags.mockResolvedValue({ title: 'clip' });
  mocks.extractVideoDuration.mockResolvedValue(undefined);
  mocks.captureVideoPosterCandidates.mockResolvedValue([]);
  mocks.getPresignedUploadUrlsAction.mockResolvedValue({
    success: true,
    data: [
      {
        uploadUrl: 'https://s3.example.com/put',
        s3Key: 'media/videos/aaa/poster.jpg',
        cdnUrl: 'https://cdn.example.com/poster.jpg',
      },
    ],
  });
  mocks.uploadFileToS3.mockResolvedValue({
    success: true,
    s3Key: 'media/videos/aaa/poster.jpg',
    cdnUrl: 'https://cdn.example.com/poster.jpg',
  });
  // Default poster-upload behaviour mirrors the real hook: presign → PUT → write
  // `posterUrl`. A presign/PUT failure surfaces an inline error and leaves the
  // form value untouched, matching the hook's replace-only contract.
  mocks.posterUploadImpl.mockImplementation(
    async (
      file: File,
      {
        setValue,
        setUploadedPosterUrl,
        setErrorMessage,
      }: {
        setValue: UseFormSetValue<VideoFormData>;
        setUploadedPosterUrl: (url: string | null) => void;
        setErrorMessage: (message: string | null) => void;
      }
    ) => {
      const presigned = await mocks.getPresignedUploadUrlsAction('videos', 'a'.repeat(24), [
        { fileName: file.name, contentType: file.type, fileSize: file.size },
      ]);
      const target = presigned.success ? presigned.data?.[0] : undefined;
      if (!target) {
        setErrorMessage(presigned.error ?? 'Failed to prepare the poster upload.');
        return;
      }
      const result = await mocks.uploadFileToS3(file, target);
      if (!result.success) {
        setErrorMessage(result.error ?? 'Failed to upload the poster.');
        return;
      }
      setValue('posterUrl', result.cdnUrl, { shouldDirty: true, shouldValidate: true });
      setUploadedPosterUrl(result.cdnUrl);
    }
  );
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:candidate');
  globalThis.URL.revokeObjectURL = vi.fn();
});

const editVideo = {
  id: 'v1',
  title: 'Existing Title',
  artist: 'Existing Artist',
  category: 'INFORMATIONAL' as const,
  description: 'An existing description',
  releasedOn: new Date('2023-03-03T00:00:00.000Z'),
  durationSeconds: 120,
  s3Key: 'media/videos/v1/existing.mp4',
  fileName: 'existing.mp4',
  fileSize: 4096n,
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example.com/existing-poster.jpg',
  publishedAt: null,
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2023-03-03T00:00:00.000Z'),
  updatedAt: new Date('2023-03-03T00:00:00.000Z'),
  width: null,
  height: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: null,
  frameRate: null,
  container: null,
  audioChannels: null,
  audioSampleRateHz: null,
  sourceCreatedAt: null,
  probedAt: null,
  probeError: null,
  enrichmentStatus: null,
};

describe('VideoForm — required-field validation', () => {
  it('shows a required error for the title on empty submit', async () => {
    const user = setup();
    render(<VideoForm />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  it('shows a required error for the artist on empty submit', async () => {
    const user = setup();
    render(<VideoForm />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Artist is required')).toBeInTheDocument();
  });

  it('pre-selects Music as the default category', () => {
    setup();
    render(<VideoForm />);

    const musicRadio = screen.getByRole('radio', { name: 'Music', checked: true });
    expect(musicRadio).toBeInTheDocument();
  });

  it('shows a required error for the release date on empty submit', async () => {
    const user = setup();
    render(<VideoForm />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Release date is required')).toBeInTheDocument();
  });

  it('shows the missing-upload blocker message when no video is uploaded', () => {
    render(<VideoForm />);

    expect(screen.getByText(/upload a video file to enable saving/i)).toBeInTheDocument();
  });
});

describe('VideoForm — category selection', () => {
  it('checks the Informational radio when selected', async () => {
    const user = setup();
    render(<VideoForm />);

    await user.click(screen.getByRole('radio', { name: 'Informational' }));

    expect(screen.getByRole('radio', { name: 'Informational' })).toBeChecked();
  });
});

describe('VideoForm — metadata prefill (only-empty)', () => {
  it('preserves an already-typed title when tags provide one', async () => {
    mocks.extractVideoTags.mockResolvedValue({ title: 'Tag Title', artist: 'Tag Artist' });
    const user = setup();
    render(<VideoForm />);

    await user.type(screen.getByLabelText('Title'), 'Typed Title');
    await uploadVideoFile(user);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Typed Title'));
  });

  it('fills the artist from tags when the field is empty', async () => {
    mocks.extractVideoTags.mockResolvedValue({ title: 'Tag Title', artist: 'Tag Artist' });
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);

    await waitFor(() =>
      expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Tag Artist')
    );
  });

  it('prefills the duration when the field is empty', async () => {
    mocks.extractVideoDuration.mockResolvedValue(180);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);

    await waitFor(() => expect(screen.getByLabelText('Duration (seconds)')).toHaveValue(180));
  });

  it('does not overwrite an already-entered duration', async () => {
    mocks.extractVideoDuration.mockResolvedValue(180);
    const user = setup();
    render(<VideoForm />);

    await user.type(screen.getByLabelText('Duration (seconds)'), '90');
    await uploadVideoFile(user);

    await waitFor(() => expect(screen.getByLabelText('Duration (seconds)')).toHaveValue(90));
  });
});

describe('VideoForm — upload flow', () => {
  it('renders the upload progress reported via onProgress', async () => {
    mocks.uploadVideoMultipart.mockImplementation(
      (_file: File, { onProgress }: { onProgress?: (f: number) => void }) => {
        onProgress?.(0.5);
        return new Promise(() => undefined);
      }
    );
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);

    expect(await screen.findByText(/50%/)).toBeInTheDocument();
  });

  it('aborts the upload and returns to the pick state when cancelled', async () => {
    mocks.uploadVideoMultipart.mockImplementation(
      (_file: File, { signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () =>
            resolve({ success: false, aborted: true, error: 'Upload aborted' })
          );
        })
    );
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel upload' }));

    await waitFor(() => expect(screen.getByLabelText('Choose a video file')).toBeInTheDocument());
  });

  it('shows an info toast when the upload is cancelled', async () => {
    mocks.uploadVideoMultipart.mockImplementation(
      (_file: File, { signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () =>
            resolve({ success: false, aborted: true, error: 'Upload aborted' })
          );
        })
    );
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel upload' }));

    await waitFor(() => expect(vi.mocked(toast.info)).toHaveBeenCalled());
  });

  it('shows the done state with the file name on a successful upload', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);

    expect(await screen.findByText('clip.mp4')).toBeInTheDocument();
  });

  it('shows an inline error and a retry affordance when the upload fails', async () => {
    mocks.uploadVideoMultipart.mockResolvedValue({ success: false, error: 'Network exploded' });
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);

    expect(await screen.findByText('Network exploded')).toBeInTheDocument();
  });

  it('retries the upload with the same file when Try again is clicked', async () => {
    mocks.uploadVideoMultipart.mockResolvedValueOnce({ success: false, error: 'Network exploded' });
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mocks.uploadVideoMultipart).toHaveBeenCalledTimes(2));
  });

  it('rejects a dropped file with an unsupported type', async () => {
    render(<VideoForm />);
    const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });

    fireEvent.drop(screen.getByTestId('video-dropzone'), {
      dataTransfer: { files: [bad] },
    });

    expect(await screen.findByText('Only MP4 and WebM videos are supported')).toBeInTheDocument();
  });

  it('rejects a dropped file that exceeds the maximum size', async () => {
    render(<VideoForm />);
    const huge = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(huge, 'size', { value: 6 * 1024 ** 3 });

    fireEvent.drop(screen.getByTestId('video-dropzone'), {
      dataTransfer: { files: [huge] },
    });

    expect(await screen.findByText(/exceeds the maximum size/i)).toBeInTheDocument();
  });

  it('activates the drop zone on drag over', () => {
    render(<VideoForm />);

    fireEvent.dragOver(screen.getByTestId('video-dropzone'));

    expect(screen.getByTestId('video-dropzone')).toHaveAttribute('data-drag-over', 'true');
  });

  it('does not re-upload when Try again is clicked after a rejected file', async () => {
    const user = setup();
    render(<VideoForm />);
    const bad = new File(['x'], 'notes.txt', { type: 'text/plain' });

    fireEvent.drop(screen.getByTestId('video-dropzone'), { dataTransfer: { files: [bad] } });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(mocks.uploadVideoMultipart).not.toHaveBeenCalled();
  });
});

describe('VideoForm — create submit', () => {
  it('creates the video with the pre-generated id and uploaded file metadata', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.createVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          preGeneratedId: 'a'.repeat(24),
          s3Key: 'media/videos/aaa/clip.mp4',
          fileName: 'clip.mp4',
          fileSize: '2048',
          mimeType: 'video/mp4',
        })
      )
    );
  });

  it('navigates to the new video edit page after a successful create', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/admin/videos/${'a'.repeat(24)}`));
  });

  it('maps a server field error onto the title field', async () => {
    mocks.createVideoAsync.mockResolvedValue({
      success: false,
      fields: {},
      errors: { title: ['This title is already in use. Please choose a different one.'] },
    });
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This title is already in use. Please choose a different one.')
    ).toBeInTheDocument();
  });
});

describe('VideoForm — draft-mode submit', () => {
  it('updates the draft row and returns to the admin list after a draft flip', async () => {
    // A draft row already exists from the upload-complete flip.
    mocks.useVideoDraft.mockReturnValue({
      draftId: 'draft-video-id',
      handleUploadComplete: vi.fn(),
    });
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'draft-video-id' })
      )
    );
    expect(mocks.push).toHaveBeenCalledWith('/admin/videos');
  });
});

describe('VideoForm — edit mode', () => {
  const asEditMode = () =>
    mocks.useVideoQuery.mockReturnValue({
      data: editVideo,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

  it('shows a loading state while the video query is pending', () => {
    mocks.useVideoQuery.mockReturnValue({
      data: null,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoForm videoId="v1" />);

    expect(screen.getByText(/loading video/i)).toBeInTheDocument();
  });

  it('populates the title from the loaded video', async () => {
    asEditMode();
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
  });

  it('shows the existing poster preview', async () => {
    asEditMode();
    render(<VideoForm videoId="v1" />);

    await waitFor(() =>
      expect(screen.getByAltText('Video poster')).toHaveAttribute(
        'src',
        'https://cdn.example.com/existing-poster.jpg'
      )
    );
  });

  it('calls updateVideoAsync with the video id on submit', async () => {
    asEditMode();
    const user = setup();
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    await user.type(screen.getByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updateVideoAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
    );
  });

  it('shows a general error toast when the update fails', async () => {
    mocks.updateVideoAsync.mockResolvedValue({
      success: false,
      fields: {},
      errors: { general: ['Video not found'] },
    });
    asEditMode();
    const user = setup();
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    await user.type(screen.getByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Video not found'));
  });

  it('navigates back to the admin list when Cancel is clicked', async () => {
    asEditMode();
    const user = setup();
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.push).toHaveBeenCalledWith('/admin/videos');
  });

  it('swaps the hidden file fields when a new video is dropped', async () => {
    mocks.uploadVideoMultipart.mockResolvedValue({
      success: true,
      s3Key: 'media/videos/v1/replacement.mp4',
      fileSize: 9000,
    });
    asEditMode();
    const user = setup();
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    await uploadVideoFile(user, 'replacement.mp4', 'Replace video file');
    await screen.findByText('replacement.mp4');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ s3Key: 'media/videos/v1/replacement.mp4' }),
        })
      )
    );
  });
});

describe('VideoForm — poster', () => {
  it('shows the uploaded poster preview after a manual upload succeeds', async () => {
    const user = setup();
    render(<VideoForm />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    await waitFor(() =>
      expect(screen.getByAltText('Video poster')).toHaveAttribute(
        'src',
        'https://cdn.example.com/poster.jpg'
      )
    );
  });

  it('uploads a manually picked poster image via the same path', async () => {
    const user = setup();
    render(<VideoForm />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    await waitFor(() =>
      expect(mocks.getPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'videos',
        'a'.repeat(24),
        expect.any(Array)
      )
    );
  });

  it('shows an inline error when the poster upload fails', async () => {
    mocks.getPresignedUploadUrlsAction.mockResolvedValue({ success: false, error: 'presign boom' });
    const user = setup();
    render(<VideoForm />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    expect(await screen.findByRole('alert')).toHaveTextContent('presign boom');
  });

  it('shows an inline error when the poster PUT to S3 fails', async () => {
    mocks.uploadFileToS3.mockResolvedValue({ success: false, error: 'put failed' });
    const user = setup();
    render(<VideoForm />);

    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    expect(await screen.findByRole('alert')).toHaveTextContent('put failed');
  });

  it('submits successfully without a poster', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.createVideoAsync).toHaveBeenCalled());
  });
});

describe('VideoForm — poster candidate auto-commit on Save', () => {
  it('uploads the visible candidate frame on Save when no poster is chosen', async () => {
    mocks.captureVideoPosterCandidates.mockResolvedValue([singleCandidate()]);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    // Do NOT click "Use this frame" — just Save with the candidate visible.
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.posterUploadImpl).toHaveBeenCalledTimes(1));
    const file = mocks.posterUploadImpl.mock.calls[0][0] as File;
    expect(file.name).toBe('poster.jpg');
  });

  it('submits the auto-uploaded poster URL in the create payload', async () => {
    mocks.captureVideoPosterCandidates.mockResolvedValue([singleCandidate()]);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.createVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ posterUrl: 'https://cdn.example.com/poster.jpg' })
      )
    );
  });

  it('aborts the submit and shows an error toast when the candidate upload fails', async () => {
    mocks.captureVideoPosterCandidates.mockResolvedValue([singleCandidate()]);
    // Upload resolves without ever writing posterUrl → failed commit.
    mocks.posterUploadImpl.mockImplementation(
      async (
        _file: File,
        { setErrorMessage }: { setErrorMessage: (message: string | null) => void }
      ) => {
        setErrorMessage('put failed');
      }
    );
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Poster upload failed — try again or pick a different image.'
      )
    );
    expect(mocks.createVideoAsync).not.toHaveBeenCalled();
  });

  it('auto-uploads the frame selected in the strip on Save', async () => {
    // The sharpest frame (score 9) is pre-selected; the admin picks 6.5s instead.
    mocks.captureVideoPosterCandidates.mockResolvedValue([
      posterCandidate('x', 9, 3.7),
      posterCandidate('yy', 1, 5.1),
      posterCandidate('zzz', 2, 6.5),
    ]);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(await screen.findByRole('radio', { name: 'Frame at 6.5s' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.posterUploadImpl).toHaveBeenCalledTimes(1));
    // The 6.5s candidate's blob is 'zzz' — 3 bytes — not the argmax frame's 1.
    const file = mocks.posterUploadImpl.mock.calls[0][0] as File;
    expect(file.size).toBe(3);
  });

  it('does not re-upload a poster on Save when one is already chosen', async () => {
    mocks.captureVideoPosterCandidates.mockResolvedValue([singleCandidate()]);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    // Commit a poster manually first — posterUrl is now set.
    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);
    await waitFor(() => expect(mocks.posterUploadImpl).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.createVideoAsync).toHaveBeenCalled());
    // No second upload — the Save reused the already-persisted posterUrl.
    expect(mocks.posterUploadImpl).toHaveBeenCalledTimes(1);
  });

  it('auto-uploads the highest-scoring candidate by default on Save', async () => {
    mocks.captureVideoPosterCandidates.mockResolvedValue([
      posterCandidate('x', 1),
      posterCandidate('yy', 9),
      posterCandidate('zzz', 3),
    ]);
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.posterUploadImpl).toHaveBeenCalledTimes(1));
    // The argmax candidate's blob is 'yy' — 2 bytes — not the first frame's 1.
    const file = mocks.posterUploadImpl.mock.calls[0][0] as File;
    expect(file.size).toBe(2);
  });

  it('does not attempt a poster upload on Save when no candidate exists', async () => {
    // Default captureVideoPosterCandidates resolves [] → no candidate.
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.createVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ posterUrl: '' })
      )
    );
    expect(mocks.posterUploadImpl).not.toHaveBeenCalled();
  });

  it('disables Save while a poster upload is in flight', async () => {
    let releaseUpload: () => void = () => undefined;
    mocks.posterUploadImpl.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseUpload = resolve;
        })
    );
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    // Kick off an in-flight poster upload via the manual picker.
    const image = new File(['png'], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload a poster image'), image);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());

    // Let the upload finish so the test tears down cleanly.
    act(() => releaseUpload());
  });
});

describe('VideoForm — technical metadata card', () => {
  const probedVideo = {
    ...editVideo,
    probedAt: new Date('2023-03-04T00:00:00.000Z'),
    width: 1920,
    height: 1080,
    bitrateKbps: 4200,
  };

  it('renders the card under the file section for a probed video', async () => {
    mocks.useVideoQuery.mockReturnValue({
      data: probedVideo,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoForm videoId="v1" />);

    expect(await screen.findByTestId('video-technical-metadata-card')).toBeInTheDocument();
  });

  it('renders no card for an unprobed video', async () => {
    mocks.useVideoQuery.mockReturnValue({
      data: editVideo,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
  });

  it('renders no card in create mode', () => {
    render(<VideoForm />);

    expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
  });
});

describe('VideoForm — enrichment panel mount gating', () => {
  const asVideo = (video: unknown) =>
    mocks.useVideoQuery.mockReturnValue({
      data: video,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

  it('mounts the panel for a MUSIC video in edit mode', async () => {
    asVideo({ ...editVideo, category: 'MUSIC' });
    render(<VideoForm videoId="v1" />);

    expect(await screen.findByTestId('video-enrichment-panel')).toHaveAttribute(
      'data-video-id',
      'v1'
    );
  });

  it('writes an applied enriched release date into the form field', async () => {
    asVideo({ ...editVideo, category: 'MUSIC' });
    render(<VideoForm videoId="v1" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Apply enriched date' }));

    await waitFor(() => expect(screen.getByLabelText('Release date')).toHaveValue('2024-08-08'));
  });

  it('writes an applied enriched description into the form field', async () => {
    asVideo({ ...editVideo, category: 'MUSIC' });
    render(<VideoForm videoId="v1" />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Apply enriched description' })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Description')).toHaveValue('Enriched description.')
    );
  });

  it('appends an applied featured artist onto the existing artist string', async () => {
    asVideo({ ...editVideo, category: 'MUSIC', artist: 'Lead Act' });
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Lead Act'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Apply enriched featured artist' })
    );

    // Primary stays put; the applied name joins as a `feat.` entry.
    await waitFor(() =>
      expect(screen.getByTestId('featured-artists-value')).toHaveTextContent('Guest Vocalist')
    );
    expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Lead Act');
  });

  it('promotes the featured artist to primary when the artist is empty', async () => {
    asVideo({ ...editVideo, category: 'MUSIC', artist: '' });
    render(<VideoForm videoId="v1" />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Apply enriched featured artist' })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Guest Vocalist')
    );
  });

  it('keeps the panel out of the DOM for an INFORMATIONAL video', async () => {
    asVideo(editVideo);
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
    expect(screen.queryByTestId('video-enrichment-panel')).not.toBeInTheDocument();
  });

  it('keeps the panel out of the DOM in create mode', () => {
    render(<VideoForm />);

    expect(screen.queryByTestId('video-enrichment-panel')).not.toBeInTheDocument();
  });

  it('mounts the panel in create mode once a draft row exists (MUSIC)', async () => {
    mocks.useVideoDraft.mockReturnValue({
      draftId: 'draft-video-id',
      handleUploadComplete: vi.fn(),
    });
    render(<VideoForm />);

    // Default category is MUSIC; the draft id now stands in as the row id.
    expect(await screen.findByTestId('video-enrichment-panel')).toHaveAttribute(
      'data-video-id',
      'draft-video-id'
    );
  });
});

describe('VideoForm — server probe prefill', () => {
  it('calls the probe hook with enabled:false on create-page mount (upload idle)', () => {
    render(<VideoForm />);

    expect(mocks.useVideoProbePrefillQuery).toHaveBeenCalledWith(
      '',
      'a'.repeat(24),
      expect.objectContaining({ enabled: false })
    );
  });

  it('calls the probe hook with enabled:false on edit-page initial load (upload idle)', async () => {
    mocks.useVideoQuery.mockReturnValue({
      data: editVideo,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoForm videoId="v1" />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));

    // All calls so far must have been with enabled:false (upload still idle)
    expect(
      mocks.useVideoProbePrefillQuery.mock.calls.every(
        (call: unknown[]) =>
          typeof call[2] === 'object' &&
          call[2] !== null &&
          (call[2] as { enabled: boolean }).enabled === false
      )
    ).toBe(true);
  });

  it('calls the probe hook with enabled:true after upload success', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    // Wait for the upload success state — the file name appears
    await screen.findByText('clip.mp4');

    // After upload success: s3Key is 'media/videos/aaa/clip.mp4', status is 'success'
    await waitFor(() =>
      expect(mocks.useVideoProbePrefillQuery).toHaveBeenCalledWith(
        'media/videos/aaa/clip.mp4',
        'a'.repeat(24),
        expect.objectContaining({ enabled: true })
      )
    );
  });

  it('fills empty fields when the hook returns ok:true with tags', async () => {
    mocks.useVideoProbePrefillQuery.mockReturnValue({
      data: {
        ok: true,
        tags: {
          title: 'Probe Title',
          artist: 'Probe Artist',
          releasedOn: '2022-09-15',
          description: 'Probe description',
          durationSeconds: 300,
        },
      },
      isPending: false,
      isError: false,
    });

    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Probe Title'));
    await waitFor(() =>
      expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Probe Artist')
    );
  });

  it('leaves a user-typed field untouched when the hook returns ok:true', async () => {
    // The probe hook returns data only after the upload succeeds (enabled:true call).
    // Before that it returns no data so the effect doesn't fire early.
    mocks.useVideoProbePrefillQuery.mockImplementation(
      (_s3Key: string, _videoId: string, options: { enabled: boolean }) =>
        options.enabled
          ? {
              data: {
                ok: true,
                tags: {
                  title: 'Probe Title',
                  artist: null,
                  releasedOn: null,
                  description: null,
                  durationSeconds: null,
                },
              },
              isPending: false,
              isError: false,
            }
          : PROBE_IDLE_RESULT
    );

    const user = setup();
    render(<VideoForm />);

    await user.type(screen.getByLabelText('Title'), 'Typed Title');
    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Typed Title'));
  });

  it('makes no field changes and shows no error when the hook returns ok:false', async () => {
    // Suppress the client-side tag prefill so the title stays empty
    mocks.extractVideoTags.mockResolvedValue({});
    mocks.useVideoProbePrefillQuery.mockReturnValue({
      data: { ok: false, error: 'probe failed' },
      isPending: false,
      isError: false,
    });

    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');

    // Title stays empty — probe ok:false applies no prefill
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''));
    // No error UI rendered
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ── producers prefill — run-once guard ───────────────────────────────────────

describe('useVideoProducersPrefill — run-once guard', () => {
  const producersFirst = [{ id: 'p1', name: 'Rick Rubin' }];
  const producersSecond = [{ id: 'p2', name: 'DJ Premier' }];

  const stubVideo = editVideo;

  it('calls form.setValue("producers") exactly once even when producerData changes after the initial prefill', async () => {
    // Arrange: useVideoProducersQuery starts with producersFirst
    mocks.useVideoProducersQuery.mockReturnValue({
      isPending: false,
      error: null,
      data: producersFirst,
      refetch: vi.fn(),
    });

    // Build a real RHF form so we can spy on setValue directly
    const { result: formResult } = renderHook(() =>
      useForm<VideoFormData>({ defaultValues: { producers: [] } })
    );
    const setValueSpy = vi.spyOn(formResult.current, 'setValue');

    // Render the hook with the initial props
    const { rerender } = renderHook(() =>
      useVideoProducersPrefill({
        videoId: 'v1',
        isEditMode: true,
        video: stubVideo,
        form: formResult.current,
      })
    );

    // Wait for the initial prefill effect to fire
    await waitFor(() => expect(setValueSpy).toHaveBeenCalledWith('producers', producersFirst));
    expect(setValueSpy).toHaveBeenCalledTimes(1);

    // Act: producerData changes (simulating a background refetch)
    mocks.useVideoProducersQuery.mockReturnValue({
      isPending: false,
      error: null,
      data: producersSecond,
      refetch: vi.fn(),
    });

    rerender();

    // The guard must block the second write — setValue stays at exactly 1 call
    expect(setValueSpy).toHaveBeenCalledTimes(1);
  });
});

// ── B6: artist review section ─────────────────────────────────────────────────

const REVIEW_WITH_ENTRIES = {
  entries: [{ sourceName: 'A', role: 'primary', status: 'new', match: null, draft: null }],
  updateDraft: mocks.updateDraft,
  buildArtistDetails: mocks.buildArtistDetails,
};

describe('VideoForm — artist review section (B6)', () => {
  // Test 5a: section renders in create mode
  it('renders the review section when entries are present in create mode', async () => {
    mocks.useVideoArtistReview.mockReturnValue(REVIEW_WITH_ENTRIES);
    const user = userEvent.setup();
    render(<VideoForm />);

    await user.type(screen.getByLabelText('Artist / Creator'), 'A');

    expect(await screen.findByTestId('video-artist-review-section')).toBeInTheDocument();
  });

  // Test 5b: section renders in edit mode
  it('renders the review section when entries are present in edit mode', async () => {
    mocks.useVideoQuery.mockReturnValue({
      data: editVideo,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useVideoArtistReview.mockReturnValue(REVIEW_WITH_ENTRIES);
    render(<VideoForm videoId="v1" />);

    expect(await screen.findByTestId('video-artist-review-section')).toBeInTheDocument();
  });

  // Test 6: hook receives the watched artist value
  it('passes the artist field value to useVideoArtistReview when the artist input changes', async () => {
    const user = userEvent.setup();
    render(<VideoForm />);

    await user.type(screen.getByLabelText('Artist / Creator'), 'Ceschi');

    expect(mocks.useVideoArtistReview).toHaveBeenCalledWith(expect.stringContaining('Ceschi'));
  });

  // Test 6b: applying a primary split rewrites the artist field
  it('rewrites the artist field to feat.-joined parts when Apply split is clicked', async () => {
    mocks.useVideoArtistReview.mockReturnValue({
      entries: [],
      updateDraft: mocks.updateDraft,
      buildArtistDetails: mocks.buildArtistDetails,
      primarySplitParts: ['Alpha', 'Bravo'],
    });
    const user = userEvent.setup();
    render(<VideoForm />);

    fireEvent.change(screen.getByLabelText('Artist / Creator'), {
      target: { value: 'Alpha & Bravo' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply split' }));

    // The rewrite makes the first part primary and the rest featured.
    expect(screen.getByLabelText('Artist / Creator')).toHaveValue('Alpha');
    expect(screen.getByTestId('featured-artists-value')).toHaveTextContent('Bravo');
  });

  // Test 7: submit with non-empty artistDetails includes them in the payload
  it('includes artistDetails in the create payload when buildArtistDetails returns a non-empty array', async () => {
    const details = [{ sourceName: 'A', firstName: 'A' }];
    mocks.buildArtistDetails.mockReturnValue(details);
    const user = userEvent.setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.createVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ artistDetails: details })
      )
    );
  });

  // Test 8: submit with empty artistDetails omits the key
  it('omits artistDetails from the create payload when buildArtistDetails returns []', async () => {
    mocks.buildArtistDetails.mockReturnValue([]);
    const user = userEvent.setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.createVideoAsync).toHaveBeenCalled());
    const payload = mocks.createVideoAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('artistDetails');
  });
});
