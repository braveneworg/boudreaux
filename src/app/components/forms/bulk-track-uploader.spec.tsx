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
  BreadcrumbMenu: ({ items }: { items: Array<{ anchorText: string }> }) => (
    <nav data-testid="breadcrumb-menu">
      {items.map((item) => (
        <span key={item.anchorText}>{item.anchorText}</span>
      ))}
    </nav>
  ),
}));

// Mock fetch for metadata extraction
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL APIs
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

/**
 * Helper to create mock audio files
 */
const createMockAudioFile = (name: string, type = 'audio/mpeg', size = 1024 * 1024): File => {
  const file = new File(['audio content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/**
 * Helper to create FileList from files using mock
 * Note: DataTransfer is not available in jsdom, so we create a mock FileList
 */
const createFileList = (files: File[]): FileList => {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    *[Symbol.iterator]() {
      for (const file of files) {
        yield file;
      }
    },
  } as unknown as FileList;

  // Add indexed access
  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, { value: file, enumerable: true });
  });

  return fileList;
};

describe('BulkTrackUploader', () => {
  beforeEach(() => {
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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              title: 'Test Song',
              artist: 'Test Artist',
              album: 'Test Album',
              duration: 180,
            },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test-track.mp3');

      await userEvent.upload(input, file);

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

      await userEvent.upload(input, file);

      await waitFor(() => {
        // Check that title input has extracted metadata
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
      mockFetch.mockResolvedValue({
        ok: false,
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('fallback-title.mp3');

      await userEvent.upload(input, file);

      await waitFor(() => {
        // Should fall back to filename without extension
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

      await userEvent.upload(input, file);

      await waitFor(() => {
        // Should still add track with filename as title
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

      // Use fireEvent to bypass browser's accept attribute filtering
      fireEvent.change(input, { target: { files: createFileList([unsupportedFile]) } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('No supported audio files selected');
      });
    });

    it('should show warning when some files are skipped', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Track', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const audioFile = createMockAudioFile('track.mp3');
      const textFile = new File(['text'], 'doc.txt', { type: 'text/plain' });

      // Simulate selecting mixed files
      const files = createFileList([audioFile, textFile]);
      fireEvent.change(input, { target: { files } });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith('1 unsupported file(s) were skipped');
      });
    });

    it('should handle multiple audio files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Track', duration: 180 },
          }),
      });

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
    const setupWithTracks = async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test Track', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test.mp3');
      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    };

    it('should allow editing track title', async () => {
      await setupWithTracks();

      const titleInputs = screen.getAllByDisplayValue('Test Track');
      const titleInput = titleInputs.find((input) => input.closest('td'));
      expect(titleInput).toBeDefined();
      await userEvent.clear(titleInput!);
      await userEvent.type(titleInput!, 'New Title');

      const updatedInputs = screen.getAllByDisplayValue('New Title');
      const updatedInput = updatedInputs.find((input) => input.closest('td'));
      expect(updatedInput).toBeInTheDocument();
    });

    it('should allow editing track position', async () => {
      await setupWithTracks();

      // Find the position input (it has value '1')
      const positionInputs = screen.getAllByRole('spinbutton');
      const positionInput = positionInputs[0];

      // Clear and type new value
      await userEvent.tripleClick(positionInput);
      await userEvent.keyboard('5');

      await waitFor(() => {
        expect(positionInput).toHaveValue(5);
      });
    });

    it('should remove track when delete button clicked', async () => {
      await setupWithTracks();

      // Find the delete button by finding the Trash2 icon's parent button
      const tableRow = screen.getByRole('row', { name: /test track/i });
      const deleteBtn = within(tableRow).getByRole('button');

      await userEvent.click(deleteBtn);

      await waitFor(() => {
        expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
      });
    });

    it('should clear all tracks when Clear All clicked', async () => {
      await setupWithTracks();

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      await userEvent.click(clearButton);

      expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
    });

    it('should show options after adding tracks', async () => {
      await setupWithTracks();

      expect(screen.getByLabelText(/automatically create or match releases/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/published/i)).toBeInTheDocument();
    });

    it('should toggle auto-create release option', async () => {
      await setupWithTracks();

      const checkbox = screen.getByLabelText(/automatically create or match releases/i);
      expect(checkbox).toBeChecked();

      await userEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it('should toggle publish tracks option', async () => {
      await setupWithTracks();

      const switchEl = screen.getByLabelText(/published/i);
      // Default state is checked
      expect(switchEl).toBeChecked();

      await userEvent.click(switchEl);

      expect(switchEl).not.toBeChecked();
    });
  });

  describe('upload processing', () => {
    const setupForUpload = async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              title: 'Test Track',
              duration: 180,
              album: 'Test Album',
              artist: 'Test Artist',
            },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test.mp3');
      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    };

    it('should show upload button with correct count', async () => {
      await setupForUpload();

      expect(screen.getByRole('button', { name: /upload 1 track/i })).toBeInTheDocument();
    });

    it('should process tracks successfully', async () => {
      await setupForUpload();

      // Mock successful upload flow
      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/upload',
            cdnUrl: 'https://cdn.example.com/track.mp3',
            key: 'tracks/test.mp3',
          },
        ],
      });

      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);

      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [
          {
            index: 0,
            success: true,
            title: 'Test Track',
            trackId: 'track-123',
            releaseId: 'release-456',
            releaseTitle: 'Test Album',
            releaseCreated: false,
          },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Successfully created 1 track(s)');
      });
    });

    it.todo('should show error toast when no tracks are ready');

    it('should handle presigned URL failure', async () => {
      await setupForUpload();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: false,
        error: 'Failed to generate upload URL',
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to generate upload URL');
      });
    });

    it('should handle S3 upload failure', async () => {
      await setupForUpload();

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/upload',
            cdnUrl: 'https://cdn.example.com/track.mp3',
            key: 'tracks/test.mp3',
          },
        ],
      });

      mockUploadFilesToS3.mockResolvedValue([{ success: false, error: 'Upload failed' }]);

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('All file uploads failed');
      });
    });

    it('should handle partial track creation failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Track', duration: 180 },
          }),
      });

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
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith('Created 1 track(s), 1 failed');
      });
    });

    it('should handle complete track creation failure', async () => {
      await setupForUpload();

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
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to create tracks: Database error');
      });
    });

    it('should disable upload button during processing', async () => {
      await setupForUpload();

      mockGetPresignedUploadUrlsAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
                }),
              100
            )
          )
      );

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    });

    it('should show progress during upload', async () => {
      await setupForUpload();

      mockGetPresignedUploadUrlsAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
                }),
              100
            )
          )
      );

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      expect(screen.getByText(/processing tracks/i)).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate to admin page on cancel', async () => {
      render(<BulkTrackUploader />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });

    it('should show View Tracks button after successful upload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test Track', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test Track', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view tracks/i })).toBeInTheDocument();
      });

      const viewButton = screen.getByRole('button', { name: /view tracks/i });
      await userEvent.click(viewButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  describe('utility functions', () => {
    it.todo('should format file size correctly');

    it('should format duration correctly for short tracks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Short Track', duration: 65 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('short.mp3'));

      await waitFor(() => {
        expect(screen.getAllByText('1:05')[0]).toBeInTheDocument();
      });
    });

    it('should format duration correctly for long tracks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Long Track', duration: 3725 }, // 1:02:05
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('long.mp3'));

      await waitFor(() => {
        expect(screen.getAllByText('1:02:05')[0]).toBeInTheDocument();
      });
    });

    it('should show --:-- for missing duration', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'No Duration' },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('no-duration.mp3'));

      await waitFor(() => {
        expect(screen.getAllByText('--:--')[0]).toBeInTheDocument();
      });
    });
  });

  describe('status badges', () => {
    it('should show pending badge count', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });
    });

    it('should show failed badge on error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

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
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 failed')).toBeInTheDocument();
      });
    });
  });

  describe('release information display', () => {
    it('should show release title after successful creation', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test Track', duration: 180, album: 'Test Album' },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [
          {
            index: 0,
            success: true,
            title: 'Test Track',
            trackId: 'track-id',
            releaseId: 'release-id',
            releaseTitle: 'Test Album',
            releaseCreated: true,
          },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText(/release: test album/i)[0]).toBeInTheDocument();
        expect(screen.getAllByText('new')[0]).toBeInTheDocument();
      });
    });

    it('should show error message for failed tracks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test Track', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

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
          {
            index: 0,
            success: false,
            title: 'Test Track',
            error: 'Duplicate track title',
          },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText('Duplicate track title')[0]).toBeInTheDocument();
      });
    });
  });

  describe('SUPPORTED_AUDIO_TYPES', () => {
    it('should accept mp3 files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'MP3', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3', 'audio/mpeg'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should accept wav files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'WAV', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.wav', 'audio/wav'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should accept flac files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'FLAC', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.flac', 'audio/flac'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should accept aac files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'AAC', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.aac', 'audio/aac'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should accept m4a files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'M4A', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.m4a', 'audio/m4a'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });

    it('should accept ogg files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: { title: 'OGG', duration: 180 } }),
      });

      render(<BulkTrackUploader />);
      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.ogg', 'audio/ogg'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
    });
  });

  describe('disabled states', () => {
    it('should disable inputs during processing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
                }),
              200
            )
          )
      );

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      // Check that inputs are disabled during processing
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      expect(screen.getByLabelText(/automatically create or match releases/i)).toBeDisabled();
    });

    it('should disable upload button when tracks are extracting', async () => {
      // Create a slow metadata extraction
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      metadata: { title: 'Test', duration: 180 },
                    }),
                }),
              200
            )
          )
      );

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      const file = createMockAudioFile('test.mp3');
      fireEvent.change(input, { target: { files: createFileList([file]) } });

      // Button should be disabled while extracting
      await waitFor(() => {
        const uploadBtn = screen.getByRole('button', { name: /upload/i });
        expect(uploadBtn).toBeDisabled();
      });
    });
  });

  describe('formatFileSize utility', () => {
    it('should display file size for small files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Small File', duration: 60 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      // Small file - 512 bytes
      await userEvent.upload(input, createMockAudioFile('small.mp3', 'audio/mpeg', 512));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
      // Check that size is displayed (512 Bytes or similar)
      expect(screen.getAllByText(/bytes/i)[0]).toBeInTheDocument();
    });

    it('should display file size for zero-byte files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Empty File', duration: 0 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('empty.mp3', 'audio/mpeg', 0));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
      expect(screen.getAllByText('0 Bytes')[0]).toBeInTheDocument();
    });

    it('should display file size in KB for kilobyte files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'KB File', duration: 120 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      // 2KB file
      await userEvent.upload(input, createMockAudioFile('kb.mp3', 'audio/mpeg', 2048));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
      expect(screen.getAllByText('2 KB')[0]).toBeInTheDocument();
    });

    it('should display file size in MB for megabyte files', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'MB File', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      // 5MB file
      await userEvent.upload(input, createMockAudioFile('mb.mp3', 'audio/mpeg', 5 * 1024 * 1024));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });
      expect(screen.getAllByText('5 MB')[0]).toBeInTheDocument();
    });
  });

  describe('status icon rendering', () => {
    it('should show uploading status icon during upload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      // Mock slow presigned URL fetch to catch uploading state
      mockGetPresignedUploadUrlsAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
                }),
              100
            )
          )
      );

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      // During upload, the table row should be in uploading state
      expect(screen.getByText(/processing tracks/i)).toBeInTheDocument();
    });

    it('should show success styling for completed tracks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      // Check the row has success styling (bg-green-500/10)
      const tableRow = screen.getByRole('row', { name: /test/i });
      expect(tableRow).toHaveClass('bg-green-500/10');
    });

    it('should show error styling for failed tracks', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

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
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 failed')).toBeInTheDocument();
      });

      // Check the row has error styling (bg-destructive/10)
      const tableRow = screen.getByRole('row', { name: /test/i });
      expect(tableRow).toHaveClass('bg-destructive/10');
    });
  });

  describe('album metadata display', () => {
    it('should show album name in track list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              title: 'Track with Album',
              duration: 180,
              album: 'My Album Name',
            },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('track.mp3'));

      await waitFor(() => {
        expect(screen.getByText('My Album Name')).toBeInTheDocument();
      });
    });

    it('should show dash for track without album', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              title: 'No Album Track',
              duration: 180,
            },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('track.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      // Find the album cell which should show '-'
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      // First row is header, second row is the track
      const trackRow = rows[1];
      expect(within(trackRow).getAllByText('-')[0]).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty file selection gracefully', async () => {
      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);

      // Simulate selecting no files
      fireEvent.change(input, { target: { files: null } });

      // Should not add any tracks
      expect(screen.queryByText('Tracks (1)')).not.toBeInTheDocument();
    });

    it('should show disabled upload button with 0 tracks text initially', async () => {
      render(<BulkTrackUploader />);

      // The upload button should show "0 Tracks" and be disabled when no tracks
      const uploadBtn = screen.getByRole('button', { name: /upload.*track/i });
      expect(uploadBtn).toBeDisabled();
    });

    it('should disable title input after successful upload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      // Title input should be disabled
      const titleInputs = screen.getAllByDisplayValue('Test');
      // The track table input (not the preview input) should be disabled
      const titleInput = titleInputs.find((input) => input.closest('td'));
      expect(titleInput).toBeDisabled();
    });

    it('should disable delete button after successful upload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [{ index: 0, success: true, title: 'Test', trackId: 'id' }],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('1 created')).toBeInTheDocument();
      });

      // Delete button should be disabled for successful track
      const tableRow = screen.getByRole('row', { name: /test/i });
      const buttons = within(tableRow).getAllByRole('button');
      // Find the delete button (should be the trash icon button)
      const deleteBtn = buttons.find((btn) => btn.querySelector('svg.lucide-trash2'));
      expect(deleteBtn).toBeDisabled();
    });

    it('should handle non-Error thrown during processing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test', duration: 180 },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      // Mock throwing a non-Error object
      mockGetPresignedUploadUrlsAction.mockRejectedValue('String error');

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Bulk upload failed');
      });
    });

    it('should handle track with release not created (matched existing)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: { title: 'Test Track', duration: 180, album: 'Existing Album' },
          }),
      });

      render(<BulkTrackUploader />);

      const input = screen.getByLabelText(/select audio files/i);
      await userEvent.upload(input, createMockAudioFile('test.mp3'));

      await waitFor(() => {
        expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
      });

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [{ uploadUrl: 'url', cdnUrl: 'cdn', key: 'key' }],
      });
      mockUploadFilesToS3.mockResolvedValue([{ success: true }]);
      mockBulkCreateTracksAction.mockResolvedValue({
        success: true,
        successCount: 1,
        failedCount: 0,
        results: [
          {
            index: 0,
            success: true,
            title: 'Test Track',
            trackId: 'track-id',
            releaseId: 'release-id',
            releaseTitle: 'Existing Album',
            releaseCreated: false, // Matched existing release
          },
        ],
      });

      const uploadButton = screen.getByRole('button', { name: /upload 1 track/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getAllByText(/release: existing album/i)[0]).toBeInTheDocument();
      });

      // Should NOT show "new" badge since release wasn't created
      expect(screen.queryByText('new')).not.toBeInTheDocument();
    });
  });
});
