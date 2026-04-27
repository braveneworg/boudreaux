/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { MutableRefObject } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import type { FormatConfig } from '@/lib/constants/format-configs';
import { cn } from '@/lib/utils';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import type { DigitalFormatType, UploadState } from '@/types/digital-format';

import { formatFileSize } from './file-helpers';

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
  onRemoveFile: (formatType: DigitalFormatType) => void;
}

function StatusIcon({
  state,
  uploaded,
  uploading,
}: {
  state: UploadState;
  uploaded: boolean;
  uploading: boolean;
}) {
  if (uploaded || state.status === 'success') {
    return (
      <CheckCircle2
        className="h-5 w-5 text-green-600"
        data-testid="format-uploaded-checkmark"
        aria-label="Format uploaded"
      />
    );
  }
  if (uploading) {
    return <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-label="Uploading" />;
  }
  if (state.status === 'error') {
    return <AlertCircle className="text-destructive h-5 w-5" aria-label="Upload failed" />;
  }
  return <FileAudio className="text-zinc-950-foreground h-5 w-5" />;
}

function getStatusText(state: UploadState, uploaded: boolean): string {
  switch (state.status) {
    case 'validating':
      /* v8 ignore next -- state is synchronously overwritten by 'uploading' before render */
      return 'Validating file...';
    case 'uploading': {
      const { currentFile, totalFiles } = state;
      if (totalFiles > 1) {
        return `Uploading file ${currentFile} of ${totalFiles}...`;
      }
      return 'Uploading to cloud storage...';
    }
    case 'confirming':
      return 'Finalizing upload...';
    case 'success':
      return 'Upload successful!';
    case 'error':
      return state.message;
    default:
      return uploaded ? 'Uploaded' : 'No file uploaded';
  }
}

export function FormatAccordionItem({
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
  onRemoveFile,
}: FormatAccordionItemProps) {
  return (
    <AccordionItem key={config.type} value={config.type}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex w-full items-center gap-3">
          <StatusIcon state={state} uploaded={uploaded} uploading={uploading} />
          <span className="font-medium">{config.label}</span>
          {selected && (
            <span className="text-zinc-950-foreground mr-4 ml-auto text-xs">
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
          <p className="text-zinc-950-foreground text-sm">{config.description}</p>

          {/* Drag and drop zone */}
          <div
            onDrop={(e) => onDrop(config.type, e)}
            onDragOver={(e) => onDragOver(config.type, e)}
            onDragLeave={onDragLeave}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6',
              'hover:border-primary/50 transition-colors',
              dragOverFormat === config.type && 'border-primary bg-primary/5',
              (uploading || isLocked || isBlockedByOtherUpload) && 'pointer-events-none opacity-50'
            )}
          >
            <Upload className="text-zinc-950-foreground mb-3 h-8 w-8" />
            {isLocked ? (
              <p className="text-zinc-950-foreground mb-1 text-sm">Upload MP3 320kbps first</p>
            ) : (
              <p className="text-zinc-950-foreground mb-1 text-sm">
                Drag and drop a {config.label} file or folder here, or choose a folder below
              </p>
            )}
            <p className="text-zinc-950-foreground mb-3 text-xs">Accepts: {config.acceptTypes}</p>
            <div className="space-y-2">
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
                disabled={uploading || isLocked || isBlockedByOtherUpload}
                aria-label={`Upload ${config.label} folder`}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || isLocked || isDeletingFiles || isBlockedByOtherUpload}
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
            </div>
          </div>

          {/* Status row with file info and actions */}
          {(selected || state.status !== 'idle') && (
            <div
              className={cn(
                'rounded-md border p-3',
                state.status === 'error' && 'border-destructive bg-destructive/10',
                (uploaded || state.status === 'success') && 'border-green-500 bg-green-500/10'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <StatusIcon state={state} uploaded={uploaded} uploading={uploading} />
                  <div className="min-w-0">
                    {selected && (
                      <p className="truncate text-sm font-medium">{selected.fileName}</p>
                    )}
                    <p
                      className={cn(
                        'text-xs',
                        state.status === 'error' && 'text-destructive',
                        state.status === 'success' && 'text-green-600',
                        !['error', 'success'].includes(state.status) && 'text-zinc-950-foreground'
                      )}
                    >
                      {getStatusText(state, uploaded)}
                    </p>
                    {selected && selected.fileSize > 0 && (
                      <p className="text-zinc-950-foreground text-xs">
                        {formatFileSize(selected.fileSize)}
                      </p>
                    )}
                  </div>
                </div>
                {(uploaded || state.status === 'error') && !uploading && (
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

              {/* Uploaded files list */}
              {uploadedFiles && uploadedFiles.length >= 1 && (
                <ul className="mt-2 space-y-1 border-t pt-2">
                  {uploadedFiles.map((fileInfo, idx) => (
                    <li
                      key={fileInfo.s3Key}
                      className="text-zinc-950-foreground flex items-center gap-2 text-xs"
                    >
                      <FileAudio className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {idx + 1}. {getTrackDisplayTitle(fileInfo.title ?? null, fileInfo.fileName)}
                      </span>
                      <span className="ml-auto shrink-0">{formatFileSize(fileInfo.fileSize)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Error message with accessibility */}
          {errorMessage && (
            <div
              role="alert"
              className="border-destructive bg-destructive/10 flex items-start gap-2 rounded-md border p-3"
            >
              <AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-destructive text-sm">{errorMessage}</p>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
