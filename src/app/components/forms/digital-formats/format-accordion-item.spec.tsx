/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MutableRefObject } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Accordion } from '@/components/ui/accordion';
import type { FormatConfig } from '@/lib/constants/format-configs';
import type { UploadState } from '@/types/digital-format';

import { FormatAccordionItem } from './format-accordion-item';

import type { SelectedFile, UploadedFileInfo } from './types';

const config: FormatConfig = {
  type: 'FLAC',
  label: 'FLAC',
  description: 'Lossless audio compression',
  acceptTypes: '.flac,audio/flac',
  mimeTypes: ['audio/flac'],
};

type Overrides = Partial<React.ComponentProps<typeof FormatAccordionItem>>;

/** Render the accordion item inside an open Accordion so its content mounts. */
function renderItem(overrides: Overrides = {}) {
  const fileInputRef: MutableRefObject<Record<string, HTMLInputElement | null>> = { current: {} };
  const uploadButtonRef: MutableRefObject<Record<string, HTMLButtonElement | null>> = {
    current: {},
  };

  const props: React.ComponentProps<typeof FormatAccordionItem> = {
    config,
    state: { status: 'idle' } as UploadState,
    selected: undefined,
    uploaded: false,
    uploading: false,
    isLocked: false,
    isBlockedByOtherUpload: false,
    isDeletingFiles: false,
    errorMessage: null,
    uploadedFiles: undefined,
    dragOverFormat: null,
    fileInputRef,
    uploadButtonRef,
    onDrop: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onFileInputChange: vi.fn(),
    onUploadButtonClick: vi.fn(),
    onRemoveFile: vi.fn(),
    ...overrides,
  };

  return {
    ...render(
      <Accordion type="single" collapsible defaultValue="FLAC">
        <FormatAccordionItem {...props} />
      </Accordion>
    ),
    uploadButtonRef,
  };
}

describe('FormatAccordionItem', () => {
  describe('getStatusText default branch', () => {
    it('shows "No file uploaded" when idle and not uploaded', () => {
      renderItem({ selected: { fileName: 'x' } as SelectedFile, state: { status: 'idle' } });

      expect(screen.getByText('No file uploaded')).toBeInTheDocument();
    });

    it('shows the validating message when state is validating', () => {
      renderItem({
        selected: { fileName: 'x', fileSize: 0 } as SelectedFile,
        state: { status: 'validating' },
      });

      expect(screen.getByText('Validating file...')).toBeInTheDocument();
    });

    it('shows "Uploaded" when idle but already uploaded', () => {
      renderItem({
        selected: { fileName: 'x', fileSize: 0 } as SelectedFile,
        state: { status: 'idle' },
        uploaded: true,
      });

      expect(screen.getByText('Uploaded')).toBeInTheDocument();
    });
  });

  describe('onAnimationEnd scroll behavior', () => {
    it('scrolls the upload button into view when it is visible', () => {
      const { uploadButtonRef, container } = renderItem();
      const scrollIntoView = vi.fn();
      const button = document.createElement('button');
      Object.defineProperty(button, 'offsetParent', { value: document.body });
      button.scrollIntoView = scrollIntoView;
      uploadButtonRef.current.FLAC = button;

      const animationTarget = container.querySelector('[class*="space-y-4"]')?.parentElement;
      // The AccordionContent wrapper carries the onAnimationEnd handler.
      const target = animationTarget ?? container.firstElementChild;
      fireEvent.animationEnd(target as Element);

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    });

    it('does not scroll when the upload button is detached (offsetParent null)', () => {
      const { uploadButtonRef, container } = renderItem();
      const scrollIntoView = vi.fn();
      const button = document.createElement('button');
      Object.defineProperty(button, 'offsetParent', { value: null });
      button.scrollIntoView = scrollIntoView;
      uploadButtonRef.current.FLAC = button;

      const target = container.firstElementChild;
      fireEvent.animationEnd(target as Element);

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not throw when no upload button ref is present', () => {
      const { container } = renderItem();

      const target = container.firstElementChild;
      const run = () => fireEvent.animationEnd(target as Element);

      expect(run).not.toThrow();
    });
  });

  describe('uploaded files list', () => {
    it('renders the uploaded files list with display titles', () => {
      const uploadedFiles: UploadedFileInfo[] = [
        { fileName: 'song.flac', fileSize: 1024, s3Key: 'k1', title: 'My Song' },
      ];
      renderItem({
        uploaded: true,
        selected: { fileName: 'song.flac', fileSize: 1024 } as SelectedFile,
        uploadedFiles,
      });

      expect(screen.getByText(/My Song/)).toBeInTheDocument();
    });
  });
});
