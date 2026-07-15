/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { VideoForm, useVideoProducersPrefill } from '@/app/components/forms/video-form';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

const mocks = vi.hoisted(() => ({
  createVideoAsync: vi.fn(),
  updateVideoAsync: vi.fn(),
  useVideoQuery: vi.fn(),
  useVideoProbePrefillQuery: vi.fn(),
  useVideoProducersQuery: vi.fn(),
  uploadVideoMultipart: vi.fn(),
  extractVideoDuration: vi.fn(),
  extractVideoTags: vi.fn(),
  captureVideoPoster: vi.fn(),
  getPresignedUploadUrlsAction: vi.fn(),
  uploadFileToS3: vi.fn(),
  push: vi.fn(),
  useVideoArtistReview: vi.fn(),
  buildArtistDetails: vi.fn(),
  updateDraft: vi.fn(),
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

vi.mock('@/app/hooks/mutations/use-video-mutations', () => ({
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

vi.mock('@/app/hooks/use-video-query', () => ({
  useVideoQuery: (id: string, options: unknown) => mocks.useVideoQuery(id, options),
}));

vi.mock('@/app/hooks/use-video-probe-prefill-query', () => ({
  useVideoProbePrefillQuery: (s3Key: string, videoId: string, options: unknown) =>
    mocks.useVideoProbePrefillQuery(s3Key, videoId, options),
}));

vi.mock('@/app/hooks/use-video-producers-query', () => ({
  useVideoProducersQuery: (...args: unknown[]) => mocks.useVideoProducersQuery(...args),
}));

vi.mock('@/app/hooks/use-release-date-lookup-query', () => ({
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

vi.mock('@/app/components/forms/videos/video-metadata', () => ({
  extractVideoDuration: mocks.extractVideoDuration,
  extractVideoTags: mocks.extractVideoTags,
  captureVideoPoster: mocks.captureVideoPoster,
}));

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: mocks.getPresignedUploadUrlsAction,
}));

vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: mocks.uploadFileToS3,
}));

vi.mock('@/app/components/forms/videos/use-video-artist-review', () => ({
  useVideoArtistReview: (...args: unknown[]) => mocks.useVideoArtistReview(...args),
}));

vi.mock('@/app/components/forms/videos/video-artist-review-section', () => ({
  VideoArtistReviewSection: ({ entries }: { entries: { sourceName: string }[] }) =>
    entries.length > 0 ? (
      <div data-testid="video-artist-review-section">
        {entries.map((e) => (
          <span key={e.sourceName}>{e.sourceName}</span>
        ))}
      </div>
    ) : null,
}));

vi.mock('@/app/components/forms/videos/video-producers-section', () => ({
  VideoProducersSection: () => <div data-testid="video-producers-section" />,
}));

vi.mock('@/app/components/forms/videos/enrichment/video-enrichment-panel', () => ({
  VideoEnrichmentPanel: ({
    videoId,
    onApplyReleaseDate,
  }: {
    videoId: string;
    onApplyReleaseDate: (value: string) => void;
  }) => (
    <div data-testid="video-enrichment-panel" data-video-id={videoId}>
      <button type="button" onClick={() => onApplyReleaseDate('2024-08-08')}>
        Apply enriched date
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
  mocks.captureVideoPoster.mockResolvedValue(null);
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
  it('uploads the captured frame via presign when Use this frame is clicked', async () => {
    mocks.captureVideoPoster.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Use this frame' }));

    await waitFor(() =>
      expect(mocks.getPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'videos',
        'a'.repeat(24),
        expect.any(Array)
      )
    );
  });

  it('PUTs the captured frame to S3 when Use this frame is clicked', async () => {
    mocks.captureVideoPoster.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Use this frame' }));

    await waitFor(() => expect(mocks.uploadFileToS3).toHaveBeenCalled());
  });

  it('shows the uploaded poster preview after Use this frame succeeds', async () => {
    mocks.captureVideoPoster.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await user.click(await screen.findByRole('button', { name: 'Use this frame' }));

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
