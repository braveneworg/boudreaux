/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { FileAudio, Music } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Separator } from '@/app/components/ui/separator';
import { Accordion, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FORMAT_CONFIGS } from '@/lib/constants/format-configs';

import { FormatAccordionItem } from './digital-formats/format-accordion-item';
import { ReuploadConfirmDialog } from './digital-formats/reupload-confirm-dialog';
import { useDigitalFormatUploads } from './digital-formats/use-digital-format-uploads';

import type { DigitalFormatsAccordionProps } from './digital-formats/types';

export function DigitalFormatsAccordion({
  releaseId,
  existingFormats = [],
  onReleaseAutoCreated,
  onMetadataExtracted,
}: DigitalFormatsAccordionProps) {
  const {
    selectedFiles,
    errorMessages,
    uploadedFilesList,
    dragOverFormat,
    albumTitle,
    confirmReuploadFormat,
    isDeletingFiles,
    fileInputRefs,
    uploadButtonRefs,
    getUploadState,
    isUploading,
    isUploaded,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleRemoveFile,
    handleUploadButtonClick,
    handleConfirmReupload,
    setConfirmReuploadFormat,
  } = useDigitalFormatUploads({
    releaseId,
    existingFormats,
    onReleaseAutoCreated,
    onMetadataExtracted,
  });

  // Computed counts for badges
  const successCount = FORMAT_CONFIGS.filter((c) => isUploaded(c.type)).length;
  const errorCount = FORMAT_CONFIGS.filter((c) => getUploadState(c.type).status === 'error').length;
  const uploadingCount = FORMAT_CONFIGS.filter((c) => isUploading(c.type)).length;
  const pendingCount = FORMAT_CONFIGS.length - successCount - errorCount - uploadingCount;
  const isAnyUploading = uploadingCount > 0;
  const isDisabled = !releaseId;

  // In create mode, lock other formats until MP3_320KBPS is uploaded first
  const isLockedForOtherFormats = !!onReleaseAutoCreated && !isUploaded('MP3_320KBPS');

  // Total files uploaded across all formats (for badge display)
  const totalFilesUploaded = Object.values(uploadedFilesList).reduce(
    (sum, files) => sum + files.length,
    0
  );

  if (isDisabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Digital Formats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {FORMAT_CONFIGS.map((config) => (
              <AccordionItem key={config.type} value={config.type}>
                <AccordionTrigger className="hover:no-underline" disabled>
                  <div className="flex w-full items-center gap-3 opacity-50">
                    <FileAudio className="text-zinc-950-foreground h-5 w-5" />
                    <span className="font-medium">{config.label}</span>
                  </div>
                </AccordionTrigger>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Digital Formats
          {albumTitle && (
            <span className="text-zinc-950-foreground ml-2 text-sm font-normal">
              &mdash; {albumTitle}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-sm">
          {isLockedForOtherFormats
            ? 'Upload MP3 320kbps first — the release will be created automatically from the audio metadata.'
            : 'Upload audio files in various formats for user downloads. Expand each format to upload or replace files.'}
        </CardDescription>
        {(successCount > 0 || errorCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {successCount > 0 && (
              <Badge variant="default" className="bg-green-500">
                {successCount} {successCount === 1 ? 'format' : 'formats'} uploaded
                {totalFilesUploaded > successCount && ` (${totalFilesUploaded} files)`}
              </Badge>
            )}
            {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
            {pendingCount > 0 && <Badge variant="secondary">{pendingCount} remaining</Badge>}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress bar during active uploads — shows file-level batch progress */}
        {isAnyUploading &&
          (() => {
            const activeFormat = FORMAT_CONFIGS.find((c) => {
              const s = getUploadState(c.type);
              return s.status === 'uploading';
            });
            const activeState = activeFormat ? getUploadState(activeFormat.type) : undefined;
            const currentFile = activeState?.status === 'uploading' ? activeState.currentFile : 0;
            const totalFiles = activeState?.status === 'uploading' ? activeState.totalFiles : 1;
            const label = activeFormat?.label ?? 'format';
            const progressValue = totalFiles > 0 ? Math.round((currentFile / totalFiles) * 100) : 0;

            return (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading {label}...</span>
                    <span>
                      {currentFile} / {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <Progress value={progressValue} />
                </div>
                <Separator />
              </>
            );
          })()}

        <Accordion type="single" collapsible className="w-full">
          {FORMAT_CONFIGS.map((config) => {
            const state = getUploadState(config.type);
            const uploaded = isUploaded(config.type);
            const uploading = isUploading(config.type);
            const isLocked = isLockedForOtherFormats && config.type !== 'MP3_320KBPS';
            const isBlockedByOtherUpload = isAnyUploading && !uploading;

            return (
              <FormatAccordionItem
                key={config.type}
                config={config}
                state={state}
                selected={selectedFiles[config.type]}
                uploaded={uploaded}
                uploading={uploading}
                isLocked={isLocked}
                isBlockedByOtherUpload={isBlockedByOtherUpload}
                isDeletingFiles={isDeletingFiles}
                errorMessage={errorMessages[config.type]}
                uploadedFiles={uploadedFilesList[config.type]}
                dragOverFormat={dragOverFormat}
                fileInputRef={fileInputRefs}
                uploadButtonRef={uploadButtonRefs}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onFileInputChange={handleFileInputChange}
                onUploadButtonClick={handleUploadButtonClick}
                onRemoveFile={handleRemoveFile}
              />
            );
          })}
        </Accordion>
      </CardContent>

      <ReuploadConfirmDialog
        formatType={confirmReuploadFormat}
        isDeleting={isDeletingFiles}
        onCancel={() => setConfirmReuploadFormat(null)}
        onConfirm={handleConfirmReupload}
      />
    </Card>
  );
}
