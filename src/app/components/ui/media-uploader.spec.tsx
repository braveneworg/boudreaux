import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  MediaUploader,
  type MediaItem,
  AUDIO_FILE_TYPES,
  VIDEO_FILE_TYPES,
} from './media-uploader';

describe('MediaUploader', () => {
  const mockOnMediaChange = vi.fn();
  const mockOnUpload = vi.fn();
  const mockOnDelete = vi.fn();

  const defaultProps = {
    mediaItems: [] as MediaItem[],
    onMediaChange: mockOnMediaChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the drop zone', () => {
      render(<MediaUploader {...defaultProps} />);

      expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
      expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
    });

    it('should show audio and video file types by default', () => {
      render(<MediaUploader {...defaultProps} />);

      expect(screen.getByText(/audio & video files/i)).toBeInTheDocument();
    });

    it('should show audio-only types when mediaType is audio', () => {
      render(<MediaUploader {...defaultProps} mediaType="audio" />);

      expect(screen.getByText(/mp3, wav, flac, aac, ogg, m4a/i)).toBeInTheDocument();
    });

    it('should show video-only types when mediaType is video', () => {
      render(<MediaUploader {...defaultProps} mediaType="video" />);

      expect(screen.getByText(/mp4, webm, mov, avi, mkv/i)).toBeInTheDocument();
    });

    it('should show file count when items exist', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      expect(screen.getByText(/1 \/ 10 files/)).toBeInTheDocument();
    });

    it('should show maximum files message when limit reached', () => {
      const items: MediaItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        fileName: `test${i}.mp3`,
        fileSize: 1024,
        fileType: 'audio/mpeg',
        mediaType: 'audio' as const,
      }));

      render(<MediaUploader {...defaultProps} mediaItems={items} maxFiles={10} />);

      expect(screen.getByText(/maximum 10 files reached/i)).toBeInTheDocument();
    });
  });

  describe('file selection', () => {
    it('should have file input with correct accept attribute', () => {
      render(<MediaUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input).toHaveAttribute('type', 'file');
      expect(input.getAttribute('accept')).toContain('audio/mpeg');
      expect(input.getAttribute('accept')).toContain('video/mp4');
    });

    it('should accept only audio files when mediaType is audio', () => {
      render(<MediaUploader {...defaultProps} mediaType="audio" />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input.getAttribute('accept')).toContain('audio/mpeg');
      expect(input.getAttribute('accept')).not.toContain('video/mp4');
    });

    it('should accept only video files when mediaType is video', () => {
      render(<MediaUploader {...defaultProps} mediaType="video" />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input.getAttribute('accept')).toContain('video/mp4');
      expect(input.getAttribute('accept')).not.toContain('audio/mpeg');
    });

    it('should allow multiple files by default', () => {
      render(<MediaUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input).toHaveAttribute('multiple');
    });

    it('should not allow multiple files when multiple is false', () => {
      render(<MediaUploader {...defaultProps} multiple={false} />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input).not.toHaveAttribute('multiple');
    });
  });

  describe('drag and drop', () => {
    it('should highlight drop zone on drag over', () => {
      render(<MediaUploader {...defaultProps} />);

      const dropZone = screen.getByText(/click to upload/i).closest('div');
      expect(dropZone).toBeInTheDocument();

      fireEvent.dragOver(dropZone!);

      expect(dropZone).toHaveClass('border-primary');
    });

    it('should remove highlight on drag leave', () => {
      render(<MediaUploader {...defaultProps} />);

      const dropZone = screen.getByText(/click to upload/i).closest('div');
      expect(dropZone).toBeInTheDocument();

      fireEvent.dragOver(dropZone!);
      fireEvent.dragLeave(dropZone!);

      expect(dropZone).not.toHaveClass('border-primary');
    });
  });

  describe('media item display', () => {
    it('should display media item with correct info', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test-track.mp3',
          fileSize: 5 * 1024 * 1024, // 5MB
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          duration: 225,
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      expect(screen.getByText('test-track.mp3')).toBeInTheDocument();
      expect(screen.getByText('5 MB')).toBeInTheDocument();
      expect(screen.getByText('3:45')).toBeInTheDocument();
      expect(screen.getByText('audio')).toBeInTheDocument();
    });

    it('should show upload progress', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          isUploading: true,
          uploadProgress: 50,
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      expect(screen.getByText('50% uploaded')).toBeInTheDocument();
    });

    it('should show error state', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          error: 'Upload failed',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    it('should show success indicator for uploaded files', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          uploadedUrl: 'https://example.com/test.mp3',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      // Verify the file is displayed - the success indicator is an SVG checkmark
      expect(screen.getByText('test.mp3')).toBeInTheDocument();
      // Check for the green success indicator div
      expect(document.querySelector('.bg-green-500\\/90')).toBeInTheDocument();
    });
  });

  describe('delete functionality', () => {
    it('should open delete confirmation dialog', async () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      const deleteButton = screen.getByRole('button', { name: /remove file/i });
      await userEvent.click(deleteButton);

      expect(screen.getByText(/delete file/i)).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    });

    it('should call onDelete when confirmed', async () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          uploadedUrl: 'https://example.com/test.mp3',
        },
      ];

      mockOnDelete.mockResolvedValue({ success: true });

      render(<MediaUploader {...defaultProps} mediaItems={items} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /remove file/i });
      await userEvent.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /delete$/i });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('1');
      });
    });

    it('should cancel delete when canceled', async () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} />);

      const deleteButton = screen.getByRole('button', { name: /remove file/i });
      await userEvent.click(deleteButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton);

      expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument();
    });
  });

  describe('upload functionality', () => {
    it('should show upload button when there are unuploaded files', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          file: new File([''], 'test.mp3', { type: 'audio/mpeg' }),
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} onUpload={mockOnUpload} />);

      expect(screen.getByRole('button', { name: /upload 1 files/i })).toBeInTheDocument();
    });

    it('should call onUpload when upload button is clicked', async () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          file: new File([''], 'test.mp3', { type: 'audio/mpeg' }),
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} onUpload={mockOnUpload} />);

      const uploadButton = screen.getByRole('button', { name: /upload 1 files/i });
      await userEvent.click(uploadButton);

      expect(mockOnUpload).toHaveBeenCalledWith(items);
    });

    it('should not show upload button when all files are uploaded', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
          uploadedUrl: 'https://example.com/test.mp3',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} onUpload={mockOnUpload} />);

      expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should disable the component when disabled prop is true', () => {
      render(<MediaUploader {...defaultProps} disabled />);

      const input = screen.getByLabelText(/upload media files/i);
      expect(input).toBeDisabled();
    });

    it('should hide delete button when disabled', () => {
      const items: MediaItem[] = [
        {
          id: '1',
          fileName: 'test.mp3',
          fileSize: 1024,
          fileType: 'audio/mpeg',
          mediaType: 'audio',
        },
      ];

      render(<MediaUploader {...defaultProps} mediaItems={items} disabled />);

      expect(screen.queryByRole('button', { name: /remove file/i })).not.toBeInTheDocument();
    });
  });

  describe('file type constants', () => {
    it('should export AUDIO_FILE_TYPES', () => {
      expect(AUDIO_FILE_TYPES).toContain('audio/mpeg');
      expect(AUDIO_FILE_TYPES).toContain('audio/wav');
      expect(AUDIO_FILE_TYPES).toContain('audio/flac');
    });

    it('should export VIDEO_FILE_TYPES', () => {
      expect(VIDEO_FILE_TYPES).toContain('video/mp4');
      expect(VIDEO_FILE_TYPES).toContain('video/webm');
      expect(VIDEO_FILE_TYPES).toContain('video/quicktime');
    });
  });
});
