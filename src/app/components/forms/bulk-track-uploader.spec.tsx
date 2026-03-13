/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import BulkTrackUploader from './bulk-track-uploader';

// Mock server-only first to prevent errors from imported server actions
vi.mock('server-only', () => ({}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock sonner toast - define inline to avoid hoisting issues
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock bulkCreateTracksAction
const mockBulkCreateTracksAction = vi.fn();
vi.mock('@/lib/actions/bulk-create-tracks-action', () => ({
  bulkCreateTracksAction: (...args: unknown[]) => mockBulkCreateTracksAction(...args),
}));

// Mock getPresignedUploadUrlsAction
const mockGetPresignedUploadUrlsAction = vi.fn();
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: (...args: unknown[]) => mockGetPresignedUploadUrlsAction(...args),
}));

// Mock uploadFilesToS3
const mockUploadFilesToS3 = vi.fn();
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFilesToS3: (...args: unknown[]) => mockUploadFilesToS3(...args),
}));

// Mock BreadcrumbMenu component
vi.mock('../ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({
    items,
  }: {
    items: Array<{ anchorText: string; url?: string; isActive?: boolean }>;
  }) => (
    <nav data-testid="breadcrumb-menu">
      {items.map((item) => (
        <span key={item.anchorText}>{item.anchorText}</span>
      ))}
    </nav>
  ),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const createMockAudioFile = (name: string, type = 'audio/mpeg', size = 1024): File => {
  // Create content of the desired size so File.size is accurate
  const content = new Uint8Array(size);
  return new File([content], name, { type, lastModified: Date.now() });
};

const createFileList = (files: File[]): FileList => {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    *[Symbol.iterator]() {
      for (let i = 0; i < files.length; i++) yield files[i];
    },
  } as unknown as FileList;

  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, { value: file, enumerable: true });
  });

  return fileList;
};

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Default mock: metadata extraction succeeds */
const mockMetadataFetch = (overrides?: Record<string, unknown>) => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        metadata: { title: 'Test Track', duration: 180, ...overrides },
      }),
  });
};

/** Add a single track via fireEvent (faster than userEvent.upload) and wait for it to appear. */
const addTrackViaFireEvent = async (filename = 'test.mp3', mimeType = 'audio/mpeg') => {
  const input = screen.getByLabelText(/select audio files/i);
  const file = createMockAudioFile(filename, mimeType);
  fireEvent.change(input, { target: { files: createFileList([file]) } });
  await waitFor(() => {
    expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
  });
};

/** Render, add one track, return. Uses fireEvent for speed. */
const setupWithTrack = async (metadataOverrides?: Record<string, unknown>) => {
  mockMetadataFetch(metadataOverrides);
  render(<BulkTrackUploader />);
  await addTrackViaFireEvent();
};

/** Mock a full successful upload pipeline so clicking "Upload" succeeds. */
const mockSuccessfulUpload = (resultOverrides?: Record<string, unknown>) => {
  mockGetPresignedUploadUrlsAction.mockResolvedValue({
    success: true,
    data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
  });
  mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
  mockBulkCreateTracksAction.mockResolvedValue({
    success: true,
    successCount: 1,
    failedCount: 0,
    results: [{ index: 0, success: true, title: 'Test Track', trackId: 'id', ...resultOverrides }],
  });
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BulkTrackUploader', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockBulkCreateTracksAction.mockReset();
    mockGetPresignedUploadUrlsAction.mockReset();
    mockUploadFilesToS3.mockReset();
  });

  describe('rendering', () => {
    it('should render the component with correct title', () => {
      render(<BulkTrackUploader />);

      expect(screen.getByText('Bulk Track Upload')).toBeInTheDocument();
    });

    it('should render the breadcrumb navigation', () => {
      render(<BulkTrackUploader />);

      expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Tracks')).toBeInTheDocument();
      expect(screen.getByText('Bulk Upload')).toBeInTheDocument();
    });

    it('should render file input for audio files', () => {
      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      expect(input).toHaveAttribute('type', 'file');
      expect(input).toHaveAttribute('multiple');
    });

    it('should render description text', () => {
      render(<BulkTrackUploader />);

      expect(screen.getByText(/upload multiple audio files at once/i)).toBeInTheDocument();
      expect(screen.getByText(/supports mp3, wav, flac, aac, ogg, m4a/i)).toBeInTheDocument();
    });

    it('should render cancel button', () => {
      render(<BulkTrackUploader />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should not render options when no tracks selected', () => {
      render(<BulkTrackUploader />);

      expect(
        screen.queryByLabelText(/automatically create or match releases/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('file selection', () => {
    it('should accept audio files and add them to track list', async () => {
      mockMetadataFetch({ title: 'Test Song' });
      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test-track.mp3');

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should extract metadata from uploaded files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              title: 'Extracted Title',
              artist: 'Extracted Artist',
              album: 'Extracted Album',
              duration: 240,
              trackNumber: 5,
            },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('my-song.mp3');

      await user.upload(input, file);

      await waitFor(() => {
        const titleInputs = screen.getAllByDisplayValue('Extracted Title');
        const titleInput = titleInputs.find((input) => input.closest('td'));
        expect(titleInput).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tracks/metadata',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use filename as title when metadata extraction fails', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('fallback-title.mp3');

      await user.upload(input, file);

      await waitFor(() => {
        const titleInputs = screen.getAllByDisplayValue('fallback-title');
        const titleInput = titleInputs.find((input) => input.closest('td'));
        expect(titleInput).toBeInTheDocument();
      });
    });

    it('should handle metadata extraction error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('error-test.mp3');

      await user.upload(input, file);

      await waitFor(() => {
        const titleInputs = screen.getAllByDisplayValue('error-test');
        const titleInput = titleInputs.find((input) => input.closest('td'));
        expect(titleInput).toBeInTheDocument();
      });
    });

    it('should reject unsupported file types', async () => {
      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const unsupportedFile = new File(['text content'], 'document.txt', {
        type: 'text/plain',
      });

      fireEvent.change(input, { target: { files: createFileList([unsupportedFile]) } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('No supported audio files selected');
      });
    });

    it('should show warning when some files are skipped', async () => {
      mockMetadataFetch({ title: 'Track' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const audioFile = createMockAudioFile('track.mp3');
      const textFile = new File(['text'], 'doc.txt', { type: 'text/plain' });

      const files = createFileList([audioFile, textFile]);
      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith('1 unsupported file(s) were skipped');
      });
    });

    it('should handle multiple audio files', async () => {
      mockMetadataFetch({ title: 'Track' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const files = [
        createMockAudioFile('track1.mp3'),
        createMockAudioFile('track2.mp3'),
        createMockAudioFile('track3.mp3'),
      ];

      const fileList = createFileList(files);
      fireEvent.change(input, { target: { files: fileList } });

      await waitFor(() => {
        expect(screen.getByText('Tracks (3)')).toBeInTheDocument();
      });
    });
  });

  describe('track management', () => {
    it('should allow editing track title', async () => {
      await setupWithTrack();

      const titleInputs = screen.getAllByDisplayValue('Test Track');
      const titleInput = titleInputs.find((input) => input.closest('td'));
      expect(titleInput).toBeDefined();
      await user.clear(titleInput!);
      await user.type(titleInput!, 'New Title');

      const updatedInputs = screen.getAllByDisplayValue('New Title');
      const updatedInput = updatedInputs.find((input) => input.closest('td'));
      expect(updatedInput).toBeInTheDocument();
    });

    it('should allow editing track position', async () => {
      await setupWithTrack();

      const positionInputs = screen.getAllByRole('spinbutton');
      const positionInput = positionInputs[0];

      await user.tripleClick(positionInput);
      await user.keyboard('5');

      await waitFor(() => {
        expect(positionInput).toHaveValue(5);
      });
    });

    it('should remove track when delete button clicked', async () => {
      await setupWithTrack();

      const tableRow = screen.getByRole('row', { name: /test track/i });
      const deleteBtn = within(tableRow).getByRole('button');

      await user.click(deleteBtn);

      await waitFor(() => {
        expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
      });
    });

    it('should clear all tracks when Clear All clicked', async () => {
      await setupWithTrack();

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await user.click(clearButton);

      expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
    });

    it('should show options after adding tracks', async () => {
      await setupWithTrack();

      expect(screen.getByLabelText(/automatically create or match releases/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/published/i)).toBeInTheDocument();
    });

    it('should toggle auto-create release option', async () => {
      await setupWithTrack();

      const checkbox = screen.getByLabelText(/automatically create or match releases/i);
      expect(checkbox).toBeChecked();

      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it('should toggle publish tracks option', async () => {
      await setupWithTrack();

      const switchEl = screen.getByLabelText(/published/i);
      expect(switchEl).toBeChecked();

      await user.click(switchEl);

      expect(switchEl).not.toBeChecked();
    });
  });

  describe('upload processing', () => {
    it('should show upload button with correct count', async () => {
      await setupWithTrack();

      expect(screen.getByRole('button', { name: /upload 1 track/i })).toBeInTheDocument();
    });

    it('should process tracks successfully', async () => {
      await setupWithTrack({ album: 'Test Album', artist: 'Test Artist' });
      mockSuccessfulUpload({
        releaseId: 'release-456',
        releaseTitle: 'Test Album',
        releaseCreated: false,
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Successfully created 1 track(s)');
      });
    });

    it.todo('should show error toast when no tracks are ready');

    it('should handle presigned URL failure', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: false,
        error: 'Failed to generate upload URL',
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to generate upload URL');
      });
    });

    it('should handle S3 upload failure', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });

      mockUploadFilesToS3.mockResolvedValue([{ success: false, error: 'Upload failed' }]);

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('All file uploads failed');
      });
    });

    it('should handle partial track creation failure', async () => {
      mockMetadataFetch({ title: 'Track' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const files = createFileList([
        createMockAudioFile('track1.mp3'),
        createMockAudioFile('track2.mp3'),
      ]);
      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(screen.getByText('Tracks (2)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          { uploadUrl: 'url1', cdnUrl: 'cdn1', key: 'key1' },
          { uploadUrl: 'url2', cdnUrl: 'cdn2', key: 'key2' },
        ],
      });

      mockUploadFilesToS3.mockResolvedValue([{ success: true }, { success: true }]);

      mockBulkCreateTracksAction.mockResolvedValue({
        success: false,
        successCount: 1,
        failedCount: 1,
        results: [
          { index: 0, success: true, title: 'Track 1', trackId: 'id1' },
          { index: 1, success: false, title: 'Track 2', error: 'Duplicate title' },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 2 tracks/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith('Created 1 track(s), 1 failed');
      });
    });

    it('should handle complete track creation failure', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [],
        error: 'Database error',
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to create tracks: Database error');
      });
    });

    it('should disable upload button and show progress during processing', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockImplementation(() => new Promise(() => {}));

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
      expect(screen.getByText(/processing tracks/i)).toBeInTheDocument();
    });

    it('should handle partial S3 upload success', async () => {
      mockMetadataFetch({ title: 'Track' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const files = createFileList([
        createMockAudioFile('track1.mp3'),
        createMockAudioFile('track2.mp3'),
      ]);
      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(screen.getByText('Tracks (2)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          { uploadUrl: 'url1', cdnUrl: 'cdn1', key: 'key1' },
          { uploadUrl: 'url2', cdnUrl: 'cdn2', key: 'key2' },
        ],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }, { success: false }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Track', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 2 tracks/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });
    });

    it('should handle non-Error thrown during processing', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockRejectedValue('String error');

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Bulk upload failed');
      });
    });
  });

  describe('navigation', () => {
    it('should navigate to admin page on cancel', async () => {
      render(<BulkTrackUploader />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });

    it('should show View Tracks button after successful upload', async () => {
      await setupWithTrack();
      mockSuccessfulUpload();

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view tracks/i })).toBeInTheDocument();
      });

      const viewButton = screen.getByRole('button', { name: /view tracks/i });
      await user.click(viewButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  describe('utility display', () => {
    it.each([
      { duration: 65, expected: '1:05', label: 'short track' },
      { duration: 3725, expected: '1:02:05', label: 'long track' },
    ])('should format duration correctly for $label', async ({ duration, expected }) => {
      mockMetadataFetch({ title: 'Track', duration });

      render(<BulkTrackUploader />);
      await addTrackViaFireEvent();

      expect(screen.getAllByText(expected)[0]).toBeInTheDocument();
    });

    it('should show --:-- for missing duration', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'No Duration' } }),
      });

      render(<BulkTrackUploader />);
      await addTrackViaFireEvent('no-duration.mp3');

      expect(screen.getAllByText('--:--')[0]).toBeInTheDocument();
    });

    it.each([
      { size: 0, expected: '0 Bytes', label: 'zero-byte' },
      { size: 512, expected: /bytes/i, label: 'bytes' },
      { size: 2048, expected: '2 KB', label: 'KB' },
      { size: 5 * 1024 * 1024, expected: '5 MB', label: 'MB' },
    ])('should display file size correctly for $label files', async ({ size, expected }) => {
      mockMetadataFetch({ title: 'File' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('file.mp3', 'audio/mpeg', size);
      fireEvent.change(input, { target: { files: createFileList([file]) } });

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
      expect(screen.getAllByText(expected)[0]).toBeInTheDocument();
    });
  });

  describe('SUPPORTED_AUDIO_TYPES', () => {
    it.each([
      { ext: 'mp3', mime: 'audio/mpeg' },
      { ext: 'wav', mime: 'audio/wav' },
      { ext: 'flac', mime: 'audio/flac' },
      { ext: 'aac', mime: 'audio/aac' },
      { ext: 'm4a', mime: 'audio/m4a' },
      { ext: 'ogg', mime: 'audio/ogg' },
    ])('should accept $ext files', async ({ ext, mime }) => {
      mockMetadataFetch({ title: ext.toUpperCase() });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile(`test.${ext}`, mime);
      fireEvent.change(input, { target: { files: createFileList([file]) } });

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });
  });

  describe('status badges', () => {
    it('should show pending badge count', async () => {
      mockMetadataFetch({ title: 'Test' });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const files = createFileList([
        createMockAudioFile('track1.mp3'),
        createMockAudioFile('track2.mp3'),
      ]);
      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(screen.getByText('2 pending')).toBeInTheDocument();
      });
    });

    it('should show success badge after upload', async () => {
      await setupWithTrack();
      mockSuccessfulUpload();

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });
    });

    it('should show failed badge on error', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [{ index: 0, success: false, title: 'Test', error: 'Failed' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 failed')).toBeInTheDocument();
      });
    });
  });

  describe('release information display', () => {
    it('should show release title with "new" badge after creation', async () => {
      await setupWithTrack({ album: 'Test Album' });
      mockSuccessfulUpload({
        releaseId: 'release-id',
        releaseTitle: 'Test Album',
        releaseCreated: true,
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText(/release: test album/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText('new')[0]).toBeInTheDocument();
      });
    });

    it('should show error message for failed tracks', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [
          { index: 0, success: false, title: 'Test Track', error: 'Duplicate track title' },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText('Duplicate track title')[0]).toBeInTheDocument();
      });
    });

    it('should show release without "new" badge when matched existing', async () => {
      await setupWithTrack({ album: 'Existing Album' });
      mockSuccessfulUpload({
        releaseId: 'release-id',
        releaseTitle: 'Existing Album',
        releaseCreated: false,
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText(/release: existing album/i)[0]).toBeInTheDocument();
      });

      expect(screen.queryByText('new')).not.toBeInTheDocument();
    });
  });

  describe('disabled states', () => {
    it('should disable inputs during processing', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockImplementation(() => new Promise(() => {}));

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      expect(screen.getByLabelText(/automatically create or match releases/i)).toBeDisabled();
    });

    it('should disable upload button when tracks are extracting', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test.mp3');
      fireEvent.change(input, { target: { files: createFileList([file]) } });

      await waitFor(() => {
        const uploadBtn = screen.getByRole('button', { name: /upload/i });
        expect(uploadBtn).toBeDisabled();
      });
    });
  });

  describe('status icon rendering', () => {
    it('should show success styling for completed tracks', async () => {
      await setupWithTrack();
      mockSuccessfulUpload({ title: 'Test' });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      const tableRow = screen.getByRole('row', { name: /test/i });
      expect(tableRow).toHaveClass('bg-green-500/10');
    });

    it('should show error styling for failed tracks', async () => {
      await setupWithTrack();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: false,
        successCount: 0,
        failedCount: 1,
        results: [{ index: 0, success: false, title: 'Test', error: 'Failed' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 failed')).toBeInTheDocument();
      });

      const tableRow = screen.getByRole('row', { name: /test/i });
      expect(tableRow).toHaveClass('bg-destructive/10');
    });
  });

  describe('album metadata display', () => {
    it('should show album name in track list', async () => {
      mockMetadataFetch({ title: 'Track with Album', album: 'My Album Name' });

      render(<BulkTrackUploader />);
      await addTrackViaFireEvent();

      expect(screen.getByText('My Album Name')).toBeInTheDocument();
    });

    it('should show dash for track without album', async () => {
      mockMetadataFetch({ title: 'No Album Track' });

      render(<BulkTrackUploader />);
      await addTrackViaFireEvent();

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      const trackRow = rows[1];
      expect(within(trackRow).getAllByText('-')[0]).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty file selection gracefully', () => {
      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      fireEvent.change(input, { target: { files: null } });

      expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
    });

    it('should show disabled upload button with 0 tracks text initially', () => {
      render(<BulkTrackUploader />);

      const uploadBtn = screen.getByRole('button', { name: /upload.*track/i });
      expect(uploadBtn).toBeDisabled();
    });

    it('should disable title input after successful upload', async () => {
      await setupWithTrack();
      mockSuccessfulUpload();

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      const titleInputs = screen.getAllByDisplayValue('Test Track');
      const titleInput = titleInputs.find((input) => input.closest('td'));
      expect(titleInput).toBeDisabled();
    });

    it('should disable delete button after successful upload', async () => {
      await setupWithTrack();
      mockSuccessfulUpload({ title: 'Test' });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      const tableRow = screen.getByRole('row', { name: /test/i });
      const buttons = within(tableRow).getAllByRole('button');
      const deleteBtn = buttons.find((btn) => btn.querySelector('svg.lucide-trash2'));
      expect(deleteBtn).toBeDisabled();
    });
  });

  describe('drag and drop', () => {
    it('should handle drag over event', () => {
      render(<BulkTrackUploader />);

      const dropZone = screen.getByText(/drag and drop audio files/i).closest('div');

      fireEvent.dragOver(dropZone!, { dataTransfer: { files: [] } });

      expect(dropZone).toHaveClass('border-primary');
      expect(dropZone).toHaveClass('bg-primary/5');
    });

    it('should handle drag leave event', () => {
      render(<BulkTrackUploader />);

      const dropZone = screen.getByText(/drag and drop audio files/i).closest('div');

      fireEvent.dragOver(dropZone!, { dataTransfer: { files: [] } });
      fireEvent.dragLeave(dropZone!, { dataTransfer: { files: [] } });

      expect(dropZone).not.toHaveClass('border-primary');
      expect(dropZone).not.toHaveClass('bg-primary/5');
    });

    it('should handle drop event with audio files', async () => {
      mockMetadataFetch({ title: 'Dropped' });

      render(<BulkTrackUploader />);

      const dropZone = screen.getByText(/drag and drop audio files/i).closest('div');
      const file = createMockAudioFile('dropped.mp3');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: createFileList([file]) },
      });

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });
  });

  describe('publishTracks propagation to bulkCreateTracksAction', () => {
    const setupForPublishTest = async () => {
      await setupWithTrack({ album: 'Test Album', artist: 'Test Artist' });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test Track', trackId: 'track-123' }],
      });
    };

    it('should pass publishTracks: true when publish switch is on (default)', async () => {
      await setupForPublishTest();

      const switchEl = screen.getByLabelText(/published/i);
      expect(switchEl).toBeChecked();

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockBulkCreateTracksAction).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ title: 'Test Track' })]),
          expect.objectContaining({ publishTracks: true })
        );
      });
    });

    it('should pass publishTracks: false when publish switch is toggled off', async () => {
      await setupForPublishTest();

      const switchEl = screen.getByLabelText(/published/i);
      await user.click(switchEl);
      expect(switchEl).not.toBeChecked();

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockBulkCreateTracksAction).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ title: 'Test Track' })]),
          expect.objectContaining({ publishTracks: false })
        );
      });
    });
  });

  describe('deferred upload mode', () => {
    it.todo('should create tracks without uploading when defer upload is enabled');

    it.todo('should show queued status for deferred tracks');
  });
});
