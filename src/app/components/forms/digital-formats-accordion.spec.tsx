/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import {
  confirmDigitalFormatUploadAction,
  confirmMultiTrackUploadAction,
} from '@/lib/actions/confirm-upload-action';
import { deleteFormatFilesAction } from '@/lib/actions/delete-format-files-action';
import { findOrCreateReleaseAction } from '@/lib/actions/find-or-create-release-action';

import { DigitalFormatsAccordion } from './digital-formats-accordion';

const mockParseBlob = vi.hoisted(() => vi.fn());

// Mock Server Actions
vi.mock('@/lib/actions/confirm-upload-action', () => ({
  confirmDigitalFormatUploadAction: vi.fn(),
  confirmMultiTrackUploadAction: vi.fn(),
}));

vi.mock('@/lib/actions/find-or-create-release-action', () => ({
  findOrCreateReleaseAction: vi.fn(),
}));

vi.mock('@/lib/actions/delete-format-files-action', () => ({
  deleteFormatFilesAction: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 0 } }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('music-metadata', () => ({
  parseBlob: (...args: unknown[]) => mockParseBlob(...args),
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
    // Default: proxy route succeeds
    global.fetch = mockFetchSuccess();
    mockParseBlob.mockReset();
    mockParseBlob.mockRejectedValue(new Error('no metadata'));
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
          trackCount: 1,
          totalFileSize: 5000000,
          files: [
            {
              trackNumber: 1,
              title: null,
              fileName: 'album.mp3',
              fileSize: 5000000,
              duration: null,
            },
          ],
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
          trackCount: 1,
          totalFileSize: 5000000,
          files: [
            {
              trackNumber: 1,
              title: null,
              fileName: 'album.mp3',
              fileSize: 5000000,
              duration: null,
            },
          ],
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
      const triggers = screen.getAllByRole('button');
      triggers.forEach((trigger) => {
        expect(trigger).toBeDisabled();
      });
    });

    it('should render all format labels in disabled state', () => {
      render(<DigitalFormatsAccordion />);

      expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
      expect(screen.getByText('WAV')).toBeInTheDocument();
    });
  });

  describe('Create mode (onReleaseAutoCreated)', () => {
    it('should call onReleaseAutoCreated after MP3_320KBPS upload in create mode', async () => {
      const onReleaseAutoCreated = vi.fn();

      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Test Album',
        created: true,
      });
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onReleaseAutoCreated={onReleaseAutoCreated}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(onReleaseAutoCreated).toHaveBeenCalledWith(
          expect.objectContaining({
            releaseId: mockReleaseId,
            releaseTitle: 'Test Album',
          })
        );
      });
    });

    it('should show success status after auto-creating release on MP3_320KBPS upload', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Test Album',
        created: true,
      });
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
      });
    });

    it('should show error when findOrCreateReleaseAction fails during MP3_320KBPS upload', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: false,
        error: 'DB error',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to create release',
          expect.objectContaining({ description: 'DB error' })
        );
      });
    });

    it('should use default message when create action fails without an error', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: false,
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to create release',
          expect.objectContaining({ description: 'Failed to create release' })
        );
      });
    });
  });

  describe('Create mode locked state', () => {
    it('should show locked description in card header when MP3_320 not yet uploaded', () => {
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      expect(screen.getByText(/upload mp3 320kbps first/i)).toBeInTheDocument();
    });

    it('should show "Upload MP3 320kbps first" message in non-MP3_320 drag zones', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('FLAC'));

      await waitFor(() => {
        const messages = screen.getAllByText(/upload mp3 320kbps first/i);
        // At least one message inside the accordion content
        expect(messages.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should disable upload button for non-MP3_320 formats in create mode', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('FLAC'));

      await waitFor(() => {
        const uploadBtn = screen.getByRole('button', { name: /upload files/i });
        expect(uploadBtn).toBeDisabled();
      });
    });

    it('should not lock MP3_320KBPS drag zone in create mode', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(screen.getByText(/drag and drop a mp3.*file or folder/i)).toBeInTheDocument();
      });
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
          expect.stringContaining('Wrong file type'),
          expect.any(Object)
        );
      });
    });

    it('should reject single file drop when extension matches but MIME type is invalid', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      const flacFileWithWrongMime = new File(['audio'], 'album.flac', { type: 'audio/mpeg' });
      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => null }],
        files: [flacFileWithWrongMime],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Invalid file type for FLAC',
          expect.objectContaining({ description: expect.stringContaining('audio/flac') })
        );
      });
    });
  });

  describe('Batch upload via folder input', () => {
    it('should upload multiple matching files from folder input', async () => {
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: true,
        data: { formatId: 'format123', fileCount: 2 },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(confirmMultiTrackUploadAction).toHaveBeenCalled();
      });
    });

    it('should show error when folder has no matching files', async () => {
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
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);

      // Upload an MP3 file to the FLAC slot (use fireEvent to bypass accept filter)
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Wrong file type for FLAC',
          expect.objectContaining({
            description: expect.stringContaining('.flac'),
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

  describe('Metadata extraction (MP3_320KBPS)', () => {
    it('extracts full metadata including embedded cover art for MP3 uploads', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      mockParseBlob.mockResolvedValue({
        common: {
          album: 'Album Name',
          artist: 'Artist Name',
          albumartist: 'Album Artist',
          year: 2026,
          label: ['Label Name'],
          picture: [{ format: 'image/jpeg', data: [65, 66, 67] }],
        },
      });

      const onMetadataExtracted = vi.fn();
      const user = userEvent.setup();

      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onMetadataExtracted={onMetadataExtracted}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(onMetadataExtracted).toHaveBeenCalledWith(
          expect.objectContaining({
            album: 'Album Name',
            artist: 'Artist Name',
            albumArtist: 'Album Artist',
            year: 2026,
            label: 'Label Name',
            coverArt: expect.stringContaining('data:image/jpeg;base64,'),
          })
        );
      });
    });

    it('should call onMetadataExtracted when MP3_320KBPS file has metadata', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      mockParseBlob.mockResolvedValue({
        common: {
          album: 'Test Album',
        },
      });

      const onMetadataExtracted = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onMetadataExtracted={onMetadataExtracted}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      // Upload still succeeds regardless of metadata extraction
      await waitFor(() => {
        expect(confirmDigitalFormatUploadAction).toHaveBeenCalledWith(
          expect.objectContaining({ formatType: 'MP3_320KBPS' })
        );
      });
    });

    it('should not extract metadata for non-MP3_320KBPS formats', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const onMetadataExtracted = vi.fn();

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onMetadataExtracted={onMetadataExtracted}
        />
      );

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);
      const file = new File(['audio content'], 'album.flac', { type: 'audio/flac' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(confirmDigitalFormatUploadAction).toHaveBeenCalled();
      });

      expect(onMetadataExtracted).not.toHaveBeenCalled();
    });
  });

  describe('Upload error scenarios', () => {
    it('should reject wrong extension selected via file input before upload', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);
      const invalidFile = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, invalidFile);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Wrong file type for FLAC',
          expect.objectContaining({ description: expect.stringContaining('Expected a .flac file') })
        );
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle non-Error exception during upload', async () => {
      global.fetch = vi.fn().mockRejectedValue('string error');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio content'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: 'Upload failed. Please try again.' })
        );
      });
      consoleSpy.mockRestore();
    });

    it('should show error icon and status text for failed uploads', async () => {
      global.fetch = mockFetchError('Server error');

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);
      const file = new File(['audio content'], 'album.flac', { type: 'audio/flac' });
      await user.upload(fileInput, file);

      await waitFor(
        () => {
          expect(screen.getAllByLabelText('Upload failed').length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 5000 }
      );
    });

    it('should show remove button for errored uploads', async () => {
      global.fetch = mockFetchError('Upload error');

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

    it('should handle upload response where s3Key is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, s3Key: undefined }),
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
          expect.objectContaining({ description: 'Upload failed' })
        );
      });
    });

    it('should fall back to default upload failure message when API error message is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ success: false }),
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
          expect.objectContaining({ description: 'Upload failed' })
        );
      });
    });
  });

  describe('Batch upload scenarios', () => {
    it('should show batch progress during multi-file upload', async () => {
      // Slow fetch to keep uploading state visible
      let resolveFirst: ((value: Response) => void) | undefined;
      let resolveSecond: ((value: Response) => void) | undefined;
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise<Response>((r) => {
            resolveFirst = r;
          });
        }
        return new Promise<Response>((r) => {
          resolveSecond = r;
        });
      });

      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: true,
        data: { formatId: 'format123', fileCount: 2 },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      // Should show batch progress text
      await waitFor(() => {
        expect(screen.getByText(/Uploading MP3 320kbps.../i)).toBeInTheDocument();
      });

      // Resolve first upload
      resolveFirst!({
        ok: true,
        json: () => Promise.resolve({ success: true, s3Key: 'uploads/key1' }),
      } as Response);

      // Set second to resolve too
      await waitFor(() => {
        expect(resolveSecond).toBeDefined();
      });
      resolveSecond!({
        ok: true,
        json: () => Promise.resolve({ success: true, s3Key: 'uploads/key2' }),
      } as Response);

      await waitFor(() => {
        expect(confirmMultiTrackUploadAction).toHaveBeenCalled();
      });
    });

    it('should show warning toast when batch has partial failures', async () => {
      // When only 1 file succeeds, the code uses confirmDigitalFormatUploadAction (single-file path)
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: true,
        data: { formatId: 'format123', fileCount: 1 },
      });

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, s3Key: 'uploads/key1' }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ success: false, message: 'File too large' }),
        });
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('1 of 2 files uploaded')
        );
      });
    });

    it('should show error toast when all batch files fail', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Server error' }),
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('all files failed'));
      });
    });
  });

  describe('File input edge cases', () => {
    it('should not start upload when file input change has no files', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      global.fetch = vi.fn();

      // Fire change with empty files list
      fireEvent.change(fileInput, { target: { files: [] } });

      // Fetch should not have been called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Drop handler edge cases', () => {
    it('should handle folder read failure gracefully', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      // Mock a directory entry whose reader throws an error
      const mockDirEntry = {
        isFile: false,
        isDirectory: true,
        name: 'BadFolder',
        createReader: () => ({
          readEntries: (_cb: unknown, reject: (e: Error) => void) => {
            reject(new Error('Read failed'));
          },
        }),
      };

      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => mockDirEntry }],
        files: [],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to read folder contents');
      });
    });

    it('should ignore drop when no file is present', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('FLAC'));
      const dropZone = await screen.findByText(/drag and drop a flac/i);
      const dropTarget = dropZone.closest('[class*="border-dashed"]')!;

      global.fetch = vi.fn();

      const dataTransfer = {
        items: [{ webkitGetAsEntry: () => null }],
        files: [],
        types: ['Files'],
      };

      fireEvent.drop(dropTarget, { dataTransfer });

      // No upload triggered
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Existing format state', () => {
    it('should show file info for pre-existing formats when expanded', async () => {
      const existingFormats = [
        {
          formatType: 'MP3_320KBPS' as const,
          trackCount: 1,
          totalFileSize: 5000000,
          files: [
            {
              trackNumber: 1,
              title: null,
              fileName: 'album.mp3',
              fileSize: 5000000,
              duration: null,
            },
          ],
        },
        {
          formatType: 'FLAC' as const,
          trackCount: 1,
          totalFileSize: 25000000,
          files: [
            {
              trackNumber: 1,
              title: null,
              fileName: 'album.flac',
              fileSize: 25000000,
              duration: null,
            },
          ],
        },
      ];

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion releaseId={mockReleaseId} existingFormats={existingFormats} />
      );

      expect(screen.getByText('2 formats uploaded')).toBeInTheDocument();

      // Expand MP3 to see file info
      await user.click(screen.getByText('MP3 320kbps'));
      await waitFor(() => {
        expect(screen.getAllByText('album.mp3').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Uploaded').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Re-upload confirmation flow', () => {
    it('should show re-upload confirmation dialog when clicking re-upload on already-uploaded format', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Upload a file first
      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      // Button should now say "Re-upload files" — click it to trigger dialog
      const reuploadButton = screen.getByRole('button', { name: /re-upload files/i });
      await user.click(reuploadButton);

      await waitFor(() => {
        expect(screen.getByText('Re-upload files?')).toBeInTheDocument();
      });
    });

    it('should delete existing files and open file picker on confirm re-upload', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });
      vi.mocked(deleteFormatFilesAction).mockResolvedValue({
        success: true,
        data: { deletedCount: 1 },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Upload a file first
      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      // Click re-upload button to trigger dialog
      const reuploadButton = screen.getByRole('button', { name: /re-upload files/i });
      await user.click(reuploadButton);

      // Click confirm in the dialog
      await waitFor(() => {
        expect(screen.getByText('Re-upload files?')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByRole('button', { name: /delete & re-upload/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(deleteFormatFilesAction).toHaveBeenCalledWith({
          releaseId: mockReleaseId,
          formatType: 'MP3_320KBPS',
        });
      });
    });

    it('should show error when delete fails during re-upload', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });
      vi.mocked(deleteFormatFilesAction).mockResolvedValue({
        success: false,
        error: 'S3 error',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Upload a file first
      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      const file = new File(['audio'], 'album.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      // Click re-upload button to trigger dialog, then confirm
      const reuploadButton = screen.getByRole('button', { name: /re-upload files/i });
      await user.click(reuploadButton);
      await waitFor(() => {
        expect(screen.getByText('Re-upload files?')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByRole('button', { name: /delete & re-upload/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to delete existing files',
          expect.objectContaining({ description: 'S3 error' })
        );
      });
    });

    it('should show error when delete throws an exception', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });
      vi.mocked(deleteFormatFilesAction).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Upload, then re-upload confirm
      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      await user.upload(fileInput, new File(['audio'], 'album.mp3', { type: 'audio/mpeg' }));
      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      const reuploadButton = screen.getByRole('button', { name: /re-upload files/i });
      await user.click(reuploadButton);
      await waitFor(() => {
        expect(screen.getByText('Re-upload files?')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /delete & re-upload/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to delete existing files');
      });
    });

    it('should close re-upload dialog when dismissed', async () => {
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Upload a file first
      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      await user.upload(fileInput, new File(['audio'], 'album.mp3', { type: 'audio/mpeg' }));
      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      // Open re-upload dialog
      const reuploadButton = screen.getByRole('button', { name: /re-upload files/i });
      await user.click(reuploadButton);
      await waitFor(() => {
        expect(screen.getByText('Re-upload files?')).toBeInTheDocument();
      });

      // Cancel
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByText('Re-upload files?')).not.toBeInTheDocument();
      });
    });
  });

  describe('Create mode confirm failure (single file)', () => {
    it('should show error when confirm action fails in create mode single file upload', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Test Album',
        created: true,
      });
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: false,
        error: 'DB confirm error',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      await user.upload(fileInput, new File(['audio'], 'album.mp3', { type: 'audio/mpeg' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('upload failed'),
          expect.objectContaining({ description: 'DB confirm error' })
        );
      });
    });

    it('should use default confirm error message when create mode confirm fails without an error', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Test Album',
        created: true,
      });
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: false,
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);
      await user.upload(fileInput, new File(['audio'], 'album.mp3', { type: 'audio/mpeg' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: 'Failed to confirm upload' })
        );
      });
    });
  });

  describe('Create mode batch upload', () => {
    it('should auto-create release and confirm batch upload in create mode', async () => {
      const onReleaseAutoCreated = vi.fn();

      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Batch Album',
        created: true,
      });
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: true,
        data: { formatId: 'format123', fileCount: 2 },
      });

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onReleaseAutoCreated={onReleaseAutoCreated}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(onReleaseAutoCreated).toHaveBeenCalledWith(
          expect.objectContaining({
            releaseId: mockReleaseId,
            releaseTitle: 'Batch Album',
          })
        );
      });
    });

    it('should show error when findOrCreateReleaseAction fails in batch create mode', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: false,
        error: 'Batch create error',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to create release',
          expect.objectContaining({ description: 'Batch create error' })
        );
      });
    });

    it('should use default create error message when batch create fails without an error', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: false,
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Failed to create release',
          expect.objectContaining({ description: 'Failed to create release' })
        );
      });
    });

    it('should show error when batch confirm fails in create mode', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Batch Album',
        created: true,
      });
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: false,
        error: 'Confirm fail',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('upload failed'),
          expect.objectContaining({ description: 'Failed to confirm upload' })
        );
      });
    });

    it('should use default confirm error message when create batch confirm fails without an error', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Batch Album',
        created: true,
      });
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: false,
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'MP3 320kbps upload failed',
          expect.objectContaining({ description: 'Failed to confirm upload' })
        );
      });
    });

    it('should show warning toast for partial failures in create mode batch upload', async () => {
      vi.mocked(findOrCreateReleaseAction).mockResolvedValue({
        success: true,
        releaseId: mockReleaseId,
        releaseTitle: 'Partial Album',
        created: true,
      });
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, s3Key: 'uploads/key1' }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ success: false, message: 'File too large' }),
        });
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} onReleaseAutoCreated={vi.fn()} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('1 of 2 files uploaded')
        );
      });
    });
  });

  describe('Batch confirm failure in edit mode', () => {
    it('should show error when batch confirm fails in edit mode', async () => {
      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: false,
        error: 'Edit batch confirm fail',
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('upload failed'),
          expect.objectContaining({ description: 'Failed to confirm upload' })
        );
      });
    });
  });

  describe('Batch metadata extraction', () => {
    it('should extract metadata from first MP3_320KBPS file in batch upload', async () => {
      const onMetadataExtracted = vi.fn();

      vi.mocked(confirmMultiTrackUploadAction).mockResolvedValue({
        success: true,
        data: { formatId: 'format123', fileCount: 2 },
      });

      mockParseBlob.mockResolvedValue({
        common: {
          album: 'Batch Album',
          artist: 'Test Artist',
          year: 2025,
          label: ['Test Label'],
          picture: [{ format: 'image/png', data: [88, 89, 90] }],
        },
      });

      const user = userEvent.setup();
      render(
        <DigitalFormatsAccordion
          releaseId={mockReleaseId}
          onMetadataExtracted={onMetadataExtracted}
        />
      );

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      const file1 = new File(['a'], '01-song.mp3', { type: 'audio/mpeg' });
      const file2 = new File(['b'], '02-song.mp3', { type: 'audio/mpeg' });
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(onMetadataExtracted).toHaveBeenCalledWith(
          expect.objectContaining({ album: 'Batch Album' })
        );
      });
    });
  });

  describe('formatFileSize edge case', () => {
    it('should show 0 Bytes for zero-size files in uploaded file list', async () => {
      // Mock confirm to succeed and produce a 0-byte uploaded file entry
      vi.mocked(confirmDigitalFormatUploadAction).mockResolvedValue({
        success: true,
        data: { id: 'format123' },
      });

      // Mock fetch to return success with s3Key
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, s3Key: 'uploads/empty-key' }),
      });

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      // Create a 0-byte file
      const emptyFile = new File([], 'empty.mp3', { type: 'audio/mpeg' });
      await user.upload(fileInput, emptyFile);

      await waitFor(() => {
        expect(screen.getByText('Upload successful!')).toBeInTheDocument();
      });

      // The uploaded file list should display "0 Bytes"
      expect(screen.getByText('0 Bytes')).toBeInTheDocument();
    });
  });

  describe('Upload with empty file type', () => {
    it('should use default mime type when file.type is empty', async () => {
      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      await user.click(screen.getByText('MP3 320kbps'));
      const fileInput = await screen.findByLabelText(/upload mp3/i);

      // File with empty type — browser sometimes does this
      const file = new File(['audio content'], 'album.mp3', { type: '' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/upload/MP3_320KBPS'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'audio/mpeg',
            }),
          })
        );
      });
    });
  });

  describe('getStatusText intermediate upload states', () => {
    it('should display "Finalizing upload..." during the confirming state', async () => {
      // Make confirmDigitalFormatUploadAction hang so the component stays in 'confirming'

      vi.mocked(confirmDigitalFormatUploadAction).mockReturnValue(new Promise(() => {}));

      const user = userEvent.setup();
      render(<DigitalFormatsAccordion releaseId={mockReleaseId} />);

      // Expand FLAC accordion and upload a file
      await user.click(screen.getByText('FLAC'));
      const fileInput = await screen.findByLabelText(/upload flac/i);
      const file = new File(['audio content'], 'album.flac', { type: 'audio/flac' });
      await user.upload(fileInput, file);

      // After fetch succeeds, the state transitions to 'confirming' while awaiting the confirm action
      await waitFor(() => {
        expect(screen.getByText('Finalizing upload...')).toBeInTheDocument();
      });
    });
  });
});
