/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { MutableRefObject } from 'react';

import { AlertCircle, FileAudio, RefreshCw, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import type { FormatConfig } from '@/lib/constants/format-configs';
import { cn } from '@/lib/utils';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import type { DigitalFormatType, UploadState } from '@/types/digital-format';

import { formatFileSize } from './file-helpers';
import { StatusIcon } from './format-status-icon';
import { getStatusText } from './format-status-text';

import type { SelectedFile, UploadedFileInfo } from './types';

interface FormatAccordionItemProps {
  config: FormatConfig;
  state: UploadState;
  selected: SelectedFile | undefined;
  uploaded: boolean;
  uploading: boolean;
  isLocked: boolean;
  isBlockedByOtherUpload: boolean;
  isDeletingFiles: boolean;
  errorMessage: string | null;
  uploadedFiles: UploadedFileInfo[] | undefined;
  dragOverFormat: DigitalFormatType | null;
  fileInputRef: MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadButtonRef: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onDrop: (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileInputChange: (
    formatType: DigitalFormatType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  onUploadButtonClick: (formatType: DigitalFormatType) => void;
  onCancelUpload: (formatType: DigitalFormatType) => void;
  onRemoveFile: (formatType: DigitalFormatType) => void;
}

interface FormatDropZoneProps {
  config: FormatConfig;
  uploaded: boolean;
  uploading: boolean;
  isLocked: boolean;
  isBlockedByOtherUpload: boolean;
  isDeletingFiles: boolean;
  dragOverFormat: DigitalFormatType | null;
  fileInputRef: MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadButtonRef: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onDrop: (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileInputChange: (
    formatType: DigitalFormatType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  onUploadButtonClick: (formatType: DigitalFormatType) => void;
  onCancelUpload: (formatType: DigitalFormatType) => void;
}

interface FormatUploadControlProps {
  config: FormatConfig;
  uploaded: boolean;
  uploading: boolean;
  disableInput: boolean;
  disableButton: boolean;
  fileInputRef: MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadButtonRef: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  onFileInputChange: (
    formatType: DigitalFormatType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  onUploadButtonClick: (formatType: DigitalFormatType) => void;
  onCancelUpload: (formatType: DigitalFormatType) => void;
}

/**
 * Hidden folder input plus its Upload button, and a Cancel button while this
 * format is uploading. The drop zone goes `pointer-events-none` during an
 * upload, so the control row re-enables pointer events to keep Cancel clickable.
 */
const FormatUploadControl = ({
  config,
  uploaded,
  uploading,
  disableInput,
  disableButton,
  fileInputRef,
  uploadButtonRef,
  onFileInputChange,
  onUploadButtonClick,
  onCancelUpload,
}: FormatUploadControlProps) => (
  <div className={cn('space-y-2', uploading && 'pointer-events-auto')}>
    <Label htmlFor={`upload-${config.type}`} className="sr-only">
      Upload {config.label} folder
    </Label>
    <input
      ref={(el) => {
        fileInputRef.current[config.type] = el;
      }}
      id={`upload-${config.type}`}
      type="file"
      // @ts-expect-error -- webkitdirectory is a non-standard HTML attribute for folder selection
      webkitdirectory=""
      directory=""
      onChange={(e) => onFileInputChange(config.type, e)}
      disabled={disableInput}
      aria-label={`Upload ${config.label} folder`}
      className="hidden"
    />
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disableButton}
        onClick={() => onUploadButtonClick(config.type)}
        ref={(el) => {
          uploadButtonRef.current[config.type] = el;
        }}
      >
        {uploaded ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Re-upload files
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Upload files
          </>
        )}
      </Button>
      {uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCancelUpload(config.type)}
          aria-label={`Cancel ${config.label} upload`}
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      )}
    </div>
  </div>
);

const FormatDropZone = ({
  config,
  uploaded,
  uploading,
  isLocked,
  isBlockedByOtherUpload,
  isDeletingFiles,
  dragOverFormat,
  fileInputRef,
  uploadButtonRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInputChange,
  onUploadButtonClick,
  onCancelUpload,
}: FormatDropZoneProps) => {
  const disableInput = uploading || isLocked || isBlockedByOtherUpload;
  const disableButton = disableInput || isDeletingFiles;
  return (
    <div
      onDrop={(e) => onDrop(config.type, e)}
      onDragOver={(e) => onDragOver(config.type, e)}
      onDragLeave={onDragLeave}
      className={cn(
        'flex flex-col items-center justify-center border-2 border-dashed p-6',
        'hover:border-primary/50 transition-colors',
        dragOverFormat === config.type && 'border-primary bg-primary/5',
        disableInput && 'pointer-events-none'
      )}
    >
      {/* Only the drop-target copy dims while inert; the Cancel button below stays legible */}
      <div className={cn('flex flex-col items-center', disableInput && 'opacity-50')}>
        <Upload className="mb-3 h-8 w-8 text-zinc-950" />
        {isLocked ? (
          <p className="mb-1 text-sm text-zinc-950">Upload MP3 320kbps first</p>
        ) : (
          <p className="mb-1 text-sm text-zinc-950">
            Drag and drop a {config.label} file or folder here, or choose a folder below
          </p>
        )}
        <p className="mb-3 text-xs text-zinc-950">Accepts: {config.acceptTypes}</p>
      </div>
      <FormatUploadControl
        config={config}
        uploaded={uploaded}
        uploading={uploading}
        disableInput={disableInput}
        disableButton={disableButton}
        fileInputRef={fileInputRef}
        uploadButtonRef={uploadButtonRef}
        onFileInputChange={onFileInputChange}
        onUploadButtonClick={onUploadButtonClick}
        onCancelUpload={onCancelUpload}
      />
    </div>
  );
};

interface UploadedFilesListProps {
  uploadedFiles: UploadedFileInfo[];
}

const UploadedFilesList = ({ uploadedFiles }: UploadedFilesListProps) => (
  <ul className="mt-2 space-y-1 border-t pt-2">
    {uploadedFiles.map((fileInfo, idx) => (
      <li key={fileInfo.s3Key} className="flex items-center gap-2 text-xs text-zinc-950">
        <FileAudio className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {idx + 1}. {getTrackDisplayTitle(fileInfo.title ?? null, fileInfo.fileName)}
        </span>
        <span className="ml-auto shrink-0">{formatFileSize(fileInfo.fileSize)}</span>
      </li>
    ))}
  </ul>
);

interface FormatStatusDetailProps {
  state: UploadState;
  selected: SelectedFile | undefined;
  uploaded: boolean;
}

const FormatStatusDetail = ({ state, selected, uploaded }: FormatStatusDetailProps) => (
  <div className="min-w-0">
    {selected && <p className="truncate text-sm font-medium">{selected.fileName}</p>}
    <p
      className={cn(
        'text-xs',
        state.status === 'error' && 'text-destructive',
        state.status === 'success' && 'text-green-600',
        !['error', 'success'].includes(state.status) && 'text-zinc-950'
      )}
    >
      {getStatusText(state, uploaded)}
    </p>
    {selected && selected.fileSize > 0 && (
      <p className="text-xs text-zinc-950">{formatFileSize(selected.fileSize)}</p>
    )}
  </div>
);

interface FormatStatusRowProps {
  config: FormatConfig;
  state: UploadState;
  selected: SelectedFile | undefined;
  uploaded: boolean;
  uploading: boolean;
  uploadedFiles: UploadedFileInfo[] | undefined;
  onRemoveFile: (formatType: DigitalFormatType) => void;
}

const FormatStatusRow = ({
  config,
  state,
  selected,
  uploaded,
  uploading,
  uploadedFiles,
  onRemoveFile,
}: FormatStatusRowProps) => {
  const isSuccess = uploaded || state.status === 'success';
  const showRemove = (uploaded || state.status === 'error') && !uploading;
  return (
    <div
      className={cn(
        'border p-3',
        state.status === 'error' && 'border-destructive bg-destructive/10',
        isSuccess && 'border-green-500 bg-green-500/10'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <StatusIcon state={state} uploaded={uploaded} uploading={uploading} />
          <FormatStatusDetail state={state} selected={selected} uploaded={uploaded} />
        </div>
        {showRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveFile(config.type)}
            aria-label={`Remove ${config.label} file`}
            className="h-8 w-8 shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {uploadedFiles && uploadedFiles.length >= 1 && (
        <UploadedFilesList uploadedFiles={uploadedFiles} />
      )}
    </div>
  );
};

interface FormatErrorAlertProps {
  errorMessage: string;
}

const FormatErrorAlert = ({ errorMessage }: FormatErrorAlertProps) => (
  <div
    role="alert"
    className="border-destructive bg-destructive/10 flex items-start gap-2 border p-3"
  >
    <AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
    <p className="text-destructive text-sm">{errorMessage}</p>
  </div>
);

export const FormatAccordionItem = ({
  config,
  state,
  selected,
  uploaded,
  uploading,
  isLocked,
  isBlockedByOtherUpload,
  isDeletingFiles,
  errorMessage,
  uploadedFiles,
  dragOverFormat,
  fileInputRef,
  uploadButtonRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInputChange,
  onUploadButtonClick,
  onCancelUpload,
  onRemoveFile,
}: FormatAccordionItemProps) => (
  <AccordionItem key={config.type} value={config.type}>
    <AccordionTrigger className="hover:no-underline">
      <div className="flex w-full items-center gap-3">
        <StatusIcon state={state} uploaded={uploaded} uploading={uploading} />
        <span className="font-medium">{config.label}</span>
        {selected && (
          <span className="mr-4 ml-auto text-xs text-zinc-950">
            {selected.fileName}
            {selected.fileSize > 0 && ` (${formatFileSize(selected.fileSize)})`}
          </span>
        )}
      </div>
    </AccordionTrigger>

    <AccordionContent
      onAnimationEnd={() => {
        const el = uploadButtonRef.current[config.type];
        if (el && el.offsetParent !== null) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }}
    >
      <div className="space-y-4 pt-2">
        <p className="text-sm text-zinc-950">{config.description}</p>

        {/* Drag and drop zone */}
        <FormatDropZone
          config={config}
          uploaded={uploaded}
          uploading={uploading}
          isLocked={isLocked}
          isBlockedByOtherUpload={isBlockedByOtherUpload}
          isDeletingFiles={isDeletingFiles}
          dragOverFormat={dragOverFormat}
          fileInputRef={fileInputRef}
          uploadButtonRef={uploadButtonRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onFileInputChange={onFileInputChange}
          onUploadButtonClick={onUploadButtonClick}
          onCancelUpload={onCancelUpload}
        />

        {/* Status row with file info and actions */}
        {(selected || state.status !== 'idle') && (
          <FormatStatusRow
            config={config}
            state={state}
            selected={selected}
            uploaded={uploaded}
            uploading={uploading}
            uploadedFiles={uploadedFiles}
            onRemoveFile={onRemoveFile}
          />
        )}

        {/* Error message with accessibility */}
        {errorMessage && <FormatErrorAlert errorMessage={errorMessage} />}
      </div>
    </AccordionContent>
  </AccordionItem>
);
