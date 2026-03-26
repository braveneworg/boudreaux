/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DigitalFormatsAccordion } from './digital-formats-accordion';

// Mock Server Actions
vi.mock('@/lib/actions/confirm-upload-action', () => ({
  confirmDigitalFormatUploadAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockReleaseId = '507f1f77bcf86cd799439011';

/** Returns a resolved fetch response with JSON body */
function mockFetchSuccess(s3Key = 'uploads/key') {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true, s3Key, contentType: 'audio/mpeg' }),
  });
}

/** Returns a rejected fetch response with a JSON error body */
function mockFetchError(message = 'Upload failed') {
  return vi.fn().mockResolvedValue({
    ok: false,
    json: vi.fn().mockResolvedValue({ success: false, message }),
  });
}

describe('DigitalFormatsAccordion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: proxy route succeeds
    global.fetch = mockFetchSuccess();
  });

  describe('Card and accordion rendering', () => {
    it('should render Card with title and description', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      expect(screen.getByText('Digital Formats')).toBeInTheDocument();
      expect(screen.getByText(/upload audio files in various formats/i)).toBeInTheDocument();
    });

    it('should render accordion with all digital format items', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
      expect(screen.getByText('WAV')).toBeInTheDocument();
      expect(screen.getByText('AAC')).toBeInTheDocument();
    });

    it('should display format descriptions when accordion items are expanded', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Expand MP3 item to reveal description
      await user.click(screen.getByText('MP3 320kbps'));
      await waitFor(() => {
        expect(screen.getByText(/high quality/i)).toBeInTheDocument();
      });

      // Expand FLAC item to reveal description
      await user.click(screen.getByText('FLAC'));
      await waitFor(() => {
        expect(screen.getByText(/lossless/i)).toBeInTheDocument();
      });
    });

    it('should have collapsed accordion items by default', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // File inputs should not be visible initially
      const fileInputs = screen.queryAllByLabelText(/upload/i);
      expect(fileInputs.length).toBe(0);
    });

    it('should expand accordion item on click', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      // File input should now be visible
      await waitFor(() => {
        expect(screen.getByLabelText(/upload mp3/i)).toBeInTheDocument();
      });
    });
  });

  describe('Drag and drop zone', () => {
    it('should render drag and drop zone when accordion is expanded', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(
          screen.getByText(/drag and drop a mp3.*file or folder.*choose a folder/i)
        ).toBeInTheDocument();
      });
    });

    it('should show accepted formats in drag zone', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));

      await waitFor(() => {
        expect(screen.getByText(/\.flac,audio\/flac/i)).toBeInTheDocument();
      });
    });

    it('should extract matching file from a dropped folder', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      // Create a mock FLAC file inside a folder
      const flacFile = new File(['audio'], 'album.flac', { type: 'audio/flac' });

      // Mock the FileSystem API entry for a directory containing the file
      const mockFileEntry = {
        isFile: true,
        isDirectory: false,
        name: 'album.flac',
        file: (cb: (f: File) => void) => cb(flacFile),
      };
      const mockDirEntry = {
        isFile: false,
        isDirectory: true,
        name: 'MyAlbum',
        createReader: () => {
          let read = false;
          return {
            readEntries: (cb: (entries: unknown[]) => void) => {
              if (!read) {
                read = true;
                cb([mockFileEntry]);
              } else {
                cb([]);
              }
            },
          };
        },
      };

      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => mockDirEntry }],
        files: [],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should show error when dropped folder has no matching files', async () => {
      const { toast } = await import('sonner');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      // Folder with only a non-audio file (no format matches)
      const txtFile = new File(['readme'], 'notes.txt', { type: 'text/plain' });
      const mockFileEntry = {
        isFile: true,
        isDirectory: false,
        name: 'notes.txt',
        file: (cb: (f: File) => void) => cb(txtFile),
      };
      const mockDirEntry = {
        isFile: false,
        isDirectory: true,
        name: 'WrongFolder',
        createReader: () => {
          let read = false;
          return {
            readEntries: (cb: (entries: unknown[]) => void) => {
              if (!read) {
                read = true;
                cb([mockFileEntry]);
              } else {
                cb([]);
              }
            },
          };
        },
      };

      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => mockDirEntry }],
        files: [],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'No matching FLAC files found in folder',
          expect.objectContaining({
            description: expect.stringContaining('Expected .flac'),
          })
        );
      });
    });
  });

  describe('File input interaction', () => {
    it('should show file input when accordion item is expanded', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const flacTrigger = screen.getByText('FLAC');
      await user.click(flacTrigger);

      await waitFor(() => {
        const fileInput = screen.getByLabelText(/upload flac/i);
        expect(fileInput).toBeInTheDocument();
        expect(fileInput).toHaveAttribute('type', 'file');
        expect(fileInput).toHaveAttribute('webkitdirectory', '');
      });
    });

    it('should have webkitdirectory attribute for folder selection', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // MP3 format
      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);
      await waitFor(() => {
        const mp3Input = screen.getByLabelText(/upload mp3/i);
        expect(mp3Input).toHaveAttribute('webkitdirectory', '');
      });

      // WAV format
      const wavTrigger = screen.getByText('WAV');
      await user.click(wavTrigger);
      await waitFor(() => {
        const wavInput = screen.getByLabelText(/upload wav/i);
        expect(wavInput).toHaveAttribute('webkitdirectory', '');
      });
    });

    it('should handle file selection', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      expect((fileInput as HTMLInputElement).files?.[0]).toBe(file);
      expect((fileInput as HTMLInputElement).files?.item(0)?.name).toBe('album.mp3');
    });
  });

  describe('Status badges', () => {
    it('should not show badges when no uploads have occurred', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      expect(screen.queryByText(/uploaded/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    });

    it('should show uploaded badge for pre-existing formats', () => {
      const existingFormats = [
        {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          s3Key: 'releases/123/MP3/album.mp3',
        },
      ];

      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} existingFormats={existingFormats} />
      );

      expect(screen.getByText('1 format uploaded')).toBeInTheDocument();
    });
  });

  describe('Checkmark indicator visibility', () => {
    it('should show checkmark when format is successfully uploaded', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      // Wait for upload to complete and checkmark to appear
      await waitFor(() => {
        const checkmarks = screen.getAllByTestId('format-uploaded-checkmark');
        expect(checkmarks.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should not show checkmark when format is not uploaded', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Checkmarks should not be present for any format initially
      const checkmarks = screen.queryAllByTestId('format-uploaded-checkmark');
      expect(checkmarks).toHaveLength(0);
    });

    it('should show checkmark for pre-existing uploaded formats', () => {
      const existingFormats = [
        {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          s3Key: 'releases/123/MP3/album.mp3',
        },
      ];

      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} existingFormats={existingFormats} />
      );

      // MP3 should have checkmark in the accordion trigger
      const allCheckmarks = screen.queryAllByTestId('format-uploaded-checkmark');
      expect(allCheckmarks).toHaveLength(1);
    });
  });

  describe('Upload progress state', () => {
    it('should show loading state during file upload', async () => {
      // Never-resolving fetch keeps component in uploading state
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      // Should show loading indicator (uploading text in status row)
      await waitFor(() => {
        expect(screen.getByText(/uploading to cloud storage/i)).toBeInTheDocument();
      });
    });

    it('should disable file input during upload', async () => {
      // Never-resolving fetch keeps component in uploading state
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      // File input should be disabled during upload
      await waitFor(() => {
        expect(fileInput).toBeDisabled();
      });
    });

    it('should show success message after successful upload', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
      });
    });
  });

  describe('Toast notifications', () => {
    it('should show success toast after upload', async () => {
      const { toast } = await import('sonner');
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('MP3 320kbps uploaded successfully');
      });
    });

    it('should show error toast on upload failure', async () => {
      const { toast } = await import('sonner');

      global.fetch = mockFetchError('File too large');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: 'File too large' })
        );
      });
    });
  });

  describe('Remove file functionality', () => {
    it('should show remove button for uploaded formats', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByLabelText(/remove mp3/i)).toBeInTheDocument();
      });
    });

    it('should clear format state when remove is clicked', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByLabelText(/remove mp3/i)).toBeInTheDocument();
      });

      // Click remove
      await user.click(screen.getByLabelText(/remove mp3/i));

      // Checkmark should be gone
      await waitFor(() => {
        const checkmarks = screen.queryAllByTestId('format-uploaded-checkmark');
        expect(checkmarks).toHaveLength(0);
      });
    });
  });

  describe('Disabled state (no releaseId)', () => {
    it('should render disabled card when no releaseId is provided', () => {
      render(<DigitalFormatsAccordion />);

      expect(screen.getByText('Digital Formats')).toBeInTheDocument();
      expect(screen.getByText(/save the release first/i)).toBeInTheDocument();
    });

    it('should render all format labels in disabled state', () => {
      render(<DigitalFormatsAccordion />);

      expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
      expect(screen.getByText('WAV')).toBeInTheDocument();
    });
  });

  describe('Create mode (onPendingConfirm)', () => {
    it('should call onPendingConfirm instead of confirmAction after upload', async () => {
      const onPendingConfirm = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} onPendingConfirm={onPendingConfirm} />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(onPendingConfirm).toHaveBeenCalledWith(
          expect.objectContaining({
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
            fileName: 'album.mp3',
          })
        );
      });
    });

    it('should show pending-save status text after create-mode upload', async () => {
      const onPendingConfirm = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} onPendingConfirm={onPendingConfirm} />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/will be saved with release/i)).toBeInTheDocument();
      });
    });

    it('should call onPendingConfirmRemove when removing a pending-save upload', async () => {
      const onPendingConfirm = vi.fn();
      const onPendingConfirmRemove = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onPendingConfirm={onPendingConfirm}
          onPendingConfirmRemove={onPendingConfirmRemove}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByLabelText(/remove mp3/i)).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText(/remove mp3/i));

      expect(onPendingConfirmRemove).toHaveBeenCalledWith('MP3_320KBPS');
    });
  });

  describe('Drag over visual state', () => {
    it('should show drag highlight on dragover and clear on dragleave', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const dropZone = await screen.findByText(/drag and drop a mp3/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      // Simulate dragover
      fireEvent.dragOver(dropTarget, {
        dataTransfer: { types: ['Files'] },
      });

      expect(dropTarget.className).toContain('border-primary');

      // Simulate dragleave
      fireEvent.dragLeave(dropTarget);

      expect(dropTarget.className).not.toContain('bg-primary/5');
    });
  });

  describe('Error handling during upload', () => {
    it('should handle fetch throwing an exception', async () => {
      const { toast } = await import('sonner');
      global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: 'Network down' })
        );
      });
      consoleSpy.mockRestore();
    });

    it('should handle confirm action failure in edit mode', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');
      const { toast } = await import('sonner');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: false,
        error: 'DB write failed',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: expect.stringContaining('DB write failed') })
        );
      });
    });
  });

  describe('Single file drop', () => {
    it('should handle single file drop with valid MIME type', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      const flacFile = new File(['audio'], 'album.flac', { type: 'audio/flac' });
      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => null }],
        files: [flacFile],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should reject single file drop with wrong MIME type', async () => {
      const { toast } = await import('sonner');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      const mp3File = new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => null }],
        files: [mp3File],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Invalid file type'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Batch upload via folder input', () => {
    it('should upload multiple matching files from folder input', async () => {
      const onPendingConfirm = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} onPendingConfirm={onPendingConfirm} />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(onPendingConfirm).toHaveBeenCalled();
      });
    });

    it('should show error when folder has no matching files', async () => {
      const { toast } = await import('sonner');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);

      // A folder containing only non-FLAC files
      const file1 = new File(['a'], 'track.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], 'track.wav', { type: 'audio/wav' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('No matching'),
          expect.objectContaining({
            description: expect.stringContaining('.flac'),
          })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on file inputs', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      expect(fileInput).toHaveAccessibleName();
    });

    it('should announce errors with role="alert"', async () => {
      global.fetch = mockFetchError('File too large');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      const mp3Trigger = screen.getByText('MP3 320kbps');
      await user.click(mp3Trigger);

      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', {
        type: 'audio/mpeg',
      });

      await user.upload(fileInput, file);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('File too large');
      });
    });

    it('should show error when wrong file type is uploaded via file input', async () => {
      const { toast } = await import('sonner');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);

      // Upload an MP3 file to the FLAC slot (use fireEvent to bypass accept filter)
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'FLAC upload failed',
          expect.objectContaining({
            description: expect.stringContaining('Wrong file type'),
          })
        );
      });
    });

    it('should not start upload when file extension does not match format', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('WAV'));
      const fileInput = await screen.findByLabelText(/upload wav/i);

      // Reassign fetch so we can detect if it was called
      global.fetch = vi.fn();

      // Upload a FLAC file to the WAV slot (use fireEvent to bypass accept filter)
      const file = new File(['audio content'], 'album.flac', { type: 'audio/flac' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      // Proxy fetch should never be called when extension is wrong
      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    it('should allow upload when file type matches the format', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);

      // Upload a FLAC file to the FLAC slot — should call the proxy route
      const file = new File(['audio content'], 'album.flac', { type: 'audio/flac' });

      global.fetch = mockFetchSuccess();
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Tab to first accordion trigger
      await user.tab();

      // Enter should expand accordion
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByLabelText(/upload mp3/i)).toBeInTheDocument();
      });
    });

    it('should have ARIA label on remove button', async () => {
      const { confirmDigitalFormatUploadAction } =
        await import('@/lib/actions/confirm-upload-action');

      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        const removeBtn = screen.getByLabelText(/remove mp3/i);
        expect(removeBtn).toHaveAccessibleName();
      });
    });
  });
});
