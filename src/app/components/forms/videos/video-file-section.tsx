/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { CheckCircle2, X } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { formatFileSize } from '@/app/components/forms/digital-formats/file-helpers';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { VideoDropzone } from './video-dropzone';

import type { UseVideoUploadResult } from './use-video-upload';
import type { Control } from 'react-hook-form';

interface VideoFileSectionProps {
  control: Control<VideoFormData>;
  upload: UseVideoUploadResult;
}

const UploadingView = ({
  progress,
  onCancel,
}: {
  progress: number;
  onCancel: () => void;
}): React.ReactElement => (
  <div className="space-y-3">
    <Progress value={progress} aria-label="Upload progress" />
    <div className="flex items-center justify-between">
      <p className="text-sm text-zinc-700">Uploading… {progress}%</p>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        <X className="mr-1 size-4" aria-hidden />
        Cancel upload
      </Button>
    </div>
  </div>
);

const UploadErrorView = ({
  message,
  onRetry,
  onFile,
}: {
  message: string;
  onRetry: () => void;
  onFile: (file: File) => void;
}): React.ReactElement => (
  <div className="space-y-3">
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
    <VideoDropzone label="Choose a video file" hint="MP4 or WebM" onFile={onFile} compact />
  </div>
);

const durationLabel = (durationSeconds: string | number | undefined): string | null =>
  durationSeconds ? `${durationSeconds}s` : null;

const UploadDoneView = ({
  fileName,
  fileSize,
  durationSeconds,
  onFile,
}: {
  fileName: string;
  fileSize: string | number | undefined;
  durationSeconds: string | number | undefined;
  onFile: (file: File) => void;
}): React.ReactElement => (
  <div className="space-y-3">
    <div className="border-input flex items-center gap-2 rounded-none border p-3">
      <CheckCircle2 className="size-5 text-green-700" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <p className="text-xs text-zinc-700">
          {fileSize ? formatFileSize(Number(fileSize)) : 'Uploaded'}
          {durationLabel(durationSeconds) ? ` · ${durationLabel(durationSeconds)}` : ''}
        </p>
      </div>
    </div>
    <VideoDropzone
      label="Replace video file"
      hint="Drop a new MP4 or WebM to replace"
      onFile={onFile}
      compact
    />
  </div>
);

/**
 * The video file section: dropzone → progress + cancel → done/replace, driven by
 * the upload state machine. Blocks nothing itself; the parent gates submit on the
 * hidden `s3Key` the successful upload writes.
 */
export const VideoFileSection = ({
  control,
  upload,
}: VideoFileSectionProps): React.ReactElement => {
  const s3Key = useWatch({ control, name: 's3Key' });
  const fileName = useWatch({ control, name: 'fileName' });
  const fileSize = useWatch({ control, name: 'fileSize' });
  const durationSeconds = useWatch({ control, name: 'durationSeconds' });

  const renderArea = (): React.ReactElement => {
    if (upload.status === 'uploading') {
      return <UploadingView progress={upload.progress} onCancel={upload.cancel} />;
    }
    if (upload.status === 'error') {
      return (
        <UploadErrorView
          message={upload.errorMessage ?? 'Upload failed.'}
          onRetry={upload.retry}
          onFile={upload.selectFile}
        />
      );
    }
    if (s3Key) {
      return (
        <UploadDoneView
          fileName={fileName ?? 'Video file'}
          fileSize={fileSize}
          durationSeconds={durationSeconds}
          onFile={upload.selectFile}
        />
      );
    }
    return (
      <VideoDropzone
        label="Choose a video file"
        hint="MP4 or WebM, up to 5 GB"
        onFile={upload.selectFile}
      />
    );
  };

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Video File</h2>
      {renderArea()}
    </section>
  );
};
