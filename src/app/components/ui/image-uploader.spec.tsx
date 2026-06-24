/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { requireElement } from '@/test-utils';

import { ImageUploader, type ImageItem } from './image-uploader';

// next/image renders a plain <img> in tests so we can assert on `src`/`alt`.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

const createImageItem = (overrides: Partial<ImageItem> = {}): ImageItem => ({
  id: '1',
  preview: 'https://example.com/image.jpg',
  ...overrides,
});

describe('ImageUploader', () => {
  const mockOnImagesChange = vi.fn();
  const mockOnUpload = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnReorder = vi.fn();

  const defaultProps = {
    images: [] as ImageItem[],
    onImagesChange: mockOnImagesChange,
  };

  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the drop zone call-to-action', () => {
      render(<ImageUploader {...defaultProps} />);

      expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
    });

    it('should render the drag-and-drop hint', () => {
      render(<ImageUploader {...defaultProps} />);

      expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
    });

    it('should display the accepted file types', () => {
      render(<ImageUploader {...defaultProps} />);

      expect(screen.getByText(/jpeg, png, webp, gif/i)).toBeInTheDocument();
    });

    it('should display the max file size derived from maxFileSize', () => {
      render(<ImageUploader {...defaultProps} maxFileSize={5 * 1024 * 1024} />);

      expect(screen.getByText(/up to 5MB/i)).toBeInTheDocument();
    });

    it('should show the image count when images exist', () => {
      const images = [createImageItem({ id: 'a' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      expect(screen.getByText(/1 \/ 10 images/)).toBeInTheDocument();
    });

    it('should show the maximum reached message when at the limit', () => {
      const images = Array.from({ length: 3 }, (_, i) => createImageItem({ id: String(i) }));

      render(<ImageUploader {...defaultProps} images={images} maxImages={3} />);

      expect(screen.getByText(/maximum 3 images reached/i)).toBeInTheDocument();
    });
  });

  describe('file input', () => {
    it('should render a file input with type file', () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload images/i);
      expect(input).toHaveAttribute('type', 'file');
    });

    it('should set the accept attribute from acceptedTypes', () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload images/i);
      expect(input.getAttribute('accept')).toContain('image/jpeg');
    });

    it('should allow selecting multiple files', () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload images/i);
      expect(input).toHaveAttribute('multiple');
    });

    it('should use a custom accessibility label', () => {
      render(<ImageUploader {...defaultProps} label="Add cover art" />);

      expect(screen.getByLabelText('Add cover art')).toBeInTheDocument();
    });

    it('should create new image items when files are selected', () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload images/i);
      const file = new File(['data'], 'photo.png', { type: 'image/png' });

      fireEvent.change(input, { target: { files: [file] } });

      expect(mockOnImagesChange).toHaveBeenCalledTimes(1);
      const nextImages = mockOnImagesChange.mock.calls[0][0] as ImageItem[];
      expect(nextImages).toHaveLength(1);
    });

    it('should mark an invalid file type with an error', () => {
      render(<ImageUploader {...defaultProps} />);

      const input = screen.getByLabelText(/upload images/i);
      const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });

      fireEvent.change(input, { target: { files: [file] } });

      const nextImages = mockOnImagesChange.mock.calls[0][0] as ImageItem[];
      expect(nextImages[0].error).toMatch(/invalid file type/i);
    });
  });

  describe('drag and drop', () => {
    it('should highlight the drop zone on drag over', () => {
      render(<ImageUploader {...defaultProps} />);

      const dropZone = screen.getByText(/click to upload/i).closest('div');
      fireEvent.dragOver(requireElement(dropZone));

      expect(dropZone).toHaveClass('border-primary');
    });

    it('should remove the highlight on drag leave', () => {
      render(<ImageUploader {...defaultProps} />);

      const dropZone = screen.getByText(/click to upload/i).closest('div');
      fireEvent.dragOver(requireElement(dropZone));
      fireEvent.dragLeave(requireElement(dropZone));

      expect(dropZone).not.toHaveClass('border-primary');
    });

    it('should add dropped files as image items', () => {
      render(<ImageUploader {...defaultProps} />);

      const dropZone = screen.getByText(/click to upload/i).closest('div');
      const file = new File(['data'], 'drop.png', { type: 'image/png' });

      fireEvent.drop(requireElement(dropZone), { dataTransfer: { files: [file] } });

      expect(mockOnImagesChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('image grid', () => {
    it('should render an image preview for each item', () => {
      const images = [createImageItem({ id: 'a', altText: 'My photo' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      expect(screen.getByAltText('My photo')).toBeInTheDocument();
    });

    it('should clean malformed double-protocol preview URLs', () => {
      const images = [
        createImageItem({ id: 'a', altText: 'Fixed', preview: 'https://https://cdn/img.jpg' }),
      ];

      render(<ImageUploader {...defaultProps} images={images} />);

      expect(screen.getByAltText('Fixed')).toHaveAttribute('src', 'https://cdn/img.jpg');
    });

    it('should show an upload progress indicator while uploading', () => {
      const images = [createImageItem({ id: 'a', isUploading: true, uploadProgress: 42 })];

      render(<ImageUploader {...defaultProps} images={images} />);

      expect(screen.getByText('42%')).toBeInTheDocument();
    });

    it('should show an error overlay when an item has an error', () => {
      const images = [createImageItem({ id: 'a', error: 'Upload failed' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });
  });

  describe('preview dialog', () => {
    it('should open a preview dialog when the preview button is clicked', async () => {
      const images = [createImageItem({ id: 'a', altText: 'Preview me' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      const previewButton = screen.getByRole('button', { name: /preview image/i });
      await userEvent.click(previewButton);

      // The dialog renders a large preview image (width 1200) in addition to
      // the grid thumbnail, so scope the assertion to the open dialog.
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByAltText('Preview me')).toBeInTheDocument();
    });
  });

  describe('delete functionality', () => {
    it('should open the delete confirmation dialog', async () => {
      const images = [createImageItem({ id: 'a' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      const deleteButton = screen.getByRole('button', { name: /remove image/i });
      await userEvent.click(deleteButton);

      expect(screen.getByText(/delete image/i)).toBeInTheDocument();
    });

    it('should remove the image locally when delete is confirmed', async () => {
      const images = [createImageItem({ id: 'a' }), createImageItem({ id: 'b' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      const deleteButtons = screen.getAllByRole('button', { name: /remove image/i });
      await userEvent.click(requireElement(deleteButtons[0]));

      const confirmButton = screen.getByRole('button', { name: /^delete$/i });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnImagesChange).toHaveBeenCalled();
      });
      const remaining = mockOnImagesChange.mock.calls[0][0] as ImageItem[];
      expect(remaining.map((img) => img.id)).toEqual(['b']);
    });

    it('should call onDelete for uploaded images when confirmed', async () => {
      const images = [createImageItem({ id: 'a', uploadedUrl: 'https://cdn/a.jpg' })];
      mockOnDelete.mockResolvedValue({ success: true });

      render(<ImageUploader {...defaultProps} images={images} onDelete={mockOnDelete} />);

      const deleteButton = screen.getByRole('button', { name: /remove image/i });
      await userEvent.click(deleteButton);

      const confirmButton = screen.getByRole('button', { name: /^delete$/i });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('a');
      });
    });

    it('should not remove the image when delete is canceled', async () => {
      const images = [createImageItem({ id: 'a' })];

      render(<ImageUploader {...defaultProps} images={images} />);

      const deleteButton = screen.getByRole('button', { name: /remove image/i });
      await userEvent.click(deleteButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton);

      expect(screen.queryByText(/this action cannot be undone/i)).not.toBeInTheDocument();
      expect(mockOnImagesChange).not.toHaveBeenCalled();
    });
  });

  describe('upload functionality', () => {
    it('should show the upload button when there are unuploaded images', () => {
      const images = [
        createImageItem({ id: 'a', file: new File(['x'], 'x.png', { type: 'image/png' }) }),
      ];

      render(<ImageUploader {...defaultProps} images={images} onUpload={mockOnUpload} />);

      expect(screen.getByRole('button', { name: /upload 1 images/i })).toBeInTheDocument();
    });

    it('should call onUpload with the unuploaded images when clicked', async () => {
      const file = new File(['x'], 'x.png', { type: 'image/png' });
      const images = [createImageItem({ id: 'a', file })];

      render(<ImageUploader {...defaultProps} images={images} onUpload={mockOnUpload} />);

      const uploadButton = screen.getByRole('button', { name: /upload 1 images/i });
      await userEvent.click(uploadButton);

      expect(mockOnUpload).toHaveBeenCalledWith(images);
    });

    it('should not show the upload button when all images are uploaded', () => {
      const images = [createImageItem({ id: 'a', uploadedUrl: 'https://cdn/a.jpg' })];

      render(<ImageUploader {...defaultProps} images={images} onUpload={mockOnUpload} />);

      expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should disable the file input when disabled', () => {
      render(<ImageUploader {...defaultProps} disabled />);

      const input = screen.getByLabelText(/upload images/i);
      expect(input).toBeDisabled();
    });

    it('should hide the remove button when disabled', () => {
      const images = [createImageItem({ id: 'a' })];

      render(<ImageUploader {...defaultProps} images={images} disabled />);

      expect(screen.queryByRole('button', { name: /remove image/i })).not.toBeInTheDocument();
    });
  });

  describe('reorder support', () => {
    it('should accept an onReorder callback without rendering errors', () => {
      const images = [createImageItem({ id: 'a' }), createImageItem({ id: 'b' })];

      render(<ImageUploader {...defaultProps} images={images} onReorder={mockOnReorder} />);

      expect(screen.getAllByRole('button', { name: /remove image/i })).toHaveLength(2);
    });
  });
});
