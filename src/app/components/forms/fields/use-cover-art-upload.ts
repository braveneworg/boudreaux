/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';

import { finalizeCoverArtUploadAction } from '@/lib/actions/finalize-cover-art-upload-action';
import { generateImageVariantsAction } from '@/lib/actions/generate-image-variants-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

import type { FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type EntityType = 'artists' | 'releases' | 'tracks' | 'notifications' | 'featured-artists';

interface UseCoverArtUploadOptions<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  name: TName;
  setValue: UseFormSetValue<TFieldValues>;
  entityType: EntityType;
  entityId?: string;
  onUploadComplete?: (cdnUrl: string) => Promise<void>;
}

export interface UseCoverArtUploadReturn {
  isUploading: boolean;
  localPreviewUrl: string;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  clearPreview: () => void;
}

interface VariantCallbackParams {
  cdnUrl: string;
  useStableKey: boolean;
  entityType: EntityType;
  entityId: string | undefined;
  s3Key: string;
  onUploadComplete: (cdnUrl: string) => Promise<void>;
  blobUrl: string;
  setLocalPreviewUrl: (url: string) => void;
}

/**
 * Trigger srcset variant generation for the uploaded cover and surface any
 * failure via toast. Returns whether the step succeeded so the caller can
 * suppress the final success toast when variants are missing.
 */
const generateVariantsStep = async (cdnUrl: string): Promise<boolean> => {
  try {
    const result = await generateImageVariantsAction(cdnUrl);
    if (result.success) return true;
    console.warn('[Cover Art] Variant generation reported failure:', result.error);
    toast.error(
      `Cover uploaded, but variant generation failed: ${result.error ?? 'unknown error'}. Re-run \`pnpm run images:generate-variants\` to backfill.`
    );
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[Cover Art] Variant generation threw:', err);
    toast.error(`Cover uploaded, but variant generation threw: ${message}`);
    return false;
  }
};

interface FinalizeStepParams {
  entityType: EntityType;
  entityId: string;
  s3Key: string;
}

/**
 * Promote the stable-key upload to its canonical record. Failures are logged
 * but non-fatal — the cover is already on S3 at the stable key.
 */
const finalizeStep = async ({ entityType, entityId, s3Key }: FinalizeStepParams): Promise<void> => {
  try {
    const finalizeResult = await finalizeCoverArtUploadAction(entityType, entityId, s3Key);
    if (!finalizeResult.success) {
      console.warn('[Cover Art] Finalize step reported failure:', finalizeResult.error);
    }
  } catch (err) {
    console.warn('[Cover Art] Finalize step threw:', err);
  }
};

/**
 * Hand the CDN URL to the consumer-provided persistence callback. Returns
 * `false` (and surfaces a toast) when persistence throws so the caller can
 * abort the success path without revoking the preview.
 */
const callUploadComplete = async (
  onUploadComplete: (cdnUrl: string) => Promise<void>,
  cdnUrl: string
): Promise<boolean> => {
  try {
    await onUploadComplete(cdnUrl);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save cover art';
    toast.error(message);
    return false;
  }
};

const runVariants = async (params: VariantCallbackParams): Promise<boolean> => {
  const {
    cdnUrl,
    useStableKey,
    entityType,
    entityId,
    s3Key,
    onUploadComplete,
    blobUrl,
    setLocalPreviewUrl,
  } = params;

  const variantsOk = await generateVariantsStep(cdnUrl);

  if (useStableKey && entityId) {
    await finalizeStep({ entityType, entityId, s3Key });
  }

  const persisted = await callUploadComplete(onUploadComplete, cdnUrl);
  if (!persisted) return false;

  URL.revokeObjectURL(blobUrl);
  setLocalPreviewUrl('');
  if (variantsOk) toast.success('Cover art uploaded');
  return true;
};

interface UploadContext<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> {
  entityType: EntityType;
  entityId: string | undefined;
  name: TName;
  setValue: UseFormSetValue<TFieldValues>;
  onUploadComplete: ((cdnUrl: string) => Promise<void>) | undefined;
  setLocalPreviewUrl: (url: string) => void;
  setIsUploading: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const buildUploadPayload = (file: File, entityType: EntityType, entityId: string | undefined) => {
  const useStableKey = typeof entityId === 'string' && entityId.length > 0;
  const targetEntityId = useStableKey ? entityId : crypto.randomUUID();
  const inferredExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const stableS3Key = useStableKey
    ? `media/${entityType}/${entityId}/cover.${inferredExtension}`
    : undefined;
  return { useStableKey, targetEntityId, stableS3Key };
};

interface UploadFileParams<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  file: File;
  entityType: EntityType;
  targetEntityId: string;
  stableS3Key: string | undefined;
  name: TName;
  setValue: UseFormSetValue<TFieldValues>;
}

/**
 * Presign, upload to S3, and write the resulting CDN URL into the form. The
 * `setValue` call mirrors the original ordering — it runs even when the CDN
 * URL is empty. Returns the (possibly empty) CDN URL plus the S3 key used.
 */
const uploadFileAndStore = async <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  file,
  entityType,
  targetEntityId,
  stableS3Key,
  name,
  setValue,
}: UploadFileParams<TFieldValues, TName>): Promise<{
  cdnUrl: string | undefined;
  s3Key: string;
}> => {
  const presignedResult = await getPresignedUploadUrlsAction(entityType, targetEntityId, [
    {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      ...(stableS3Key ? { existingS3Key: stableS3Key } : {}),
    },
  ]);

  if (!presignedResult.success || !presignedResult.data?.[0]) {
    throw new Error(presignedResult.error || 'Failed to get upload URL');
  }

  const uploadResult = await uploadFileToS3(file, presignedResult.data[0]);
  if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload failed');

  setValue(name, uploadResult.cdnUrl as TFieldValues[TName], {
    shouldDirty: true,
    shouldValidate: true,
  });

  return { cdnUrl: uploadResult.cdnUrl, s3Key: presignedResult.data[0].s3Key };
};

/** Fire-and-forget variant generation for the no-callback upload path. */
const fireAndForgetVariants = (cdnUrl: string): void => {
  generateImageVariantsAction(cdnUrl).catch((err) => {
    console.warn('[Cover Art] Variant generation failed:', err);
  });
};

/** Revoke the local preview blob and announce upload success. */
const finishUpload = (blobUrl: string, setLocalPreviewUrl: (url: string) => void): void => {
  URL.revokeObjectURL(blobUrl);
  setLocalPreviewUrl('');
  toast.success('Cover art uploaded');
};

const executeUpload = async <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(
  file: File,
  blobUrl: string,
  ctx: UploadContext<TFieldValues, TName>
): Promise<void> => {
  const { entityType, entityId, name, setValue, onUploadComplete, setLocalPreviewUrl } = ctx;
  const { useStableKey, targetEntityId, stableS3Key } = buildUploadPayload(
    file,
    entityType,
    entityId
  );

  const { cdnUrl, s3Key } = await uploadFileAndStore({
    file,
    entityType,
    targetEntityId,
    stableS3Key,
    name,
    setValue,
  });

  if (!cdnUrl) {
    finishUpload(blobUrl, setLocalPreviewUrl);
    return;
  }

  if (onUploadComplete) {
    const done = await runVariants({
      cdnUrl,
      useStableKey,
      entityType,
      entityId,
      s3Key,
      onUploadComplete,
      blobUrl,
      setLocalPreviewUrl,
    });
    if (done) return;
  } else {
    fireAndForgetVariants(cdnUrl);
  }

  finishUpload(blobUrl, setLocalPreviewUrl);
};

const validateFile = (file: File): string | null => {
  if (!VALID_IMAGE_TYPES.includes(file.type))
    return 'Please select a valid image file (JPEG, PNG, WebP, or GIF)';
  if (file.size > MAX_FILE_SIZE) return 'Image must be less than 50MB';
  return null;
};

/** Revoke a blob preview URL when one is set (no-op for the empty string). */
const revokeIfSet = (url: string): void => {
  if (url) URL.revokeObjectURL(url);
};

/**
 * Validate the selected file, show a local preview, drive the upload, and
 * always reset the busy state + file input afterwards. Extracted from the
 * hook's `processFile` callback so the hook body stays within length limits;
 * the callback simply forwards its memoized context here.
 */
const runProcessFile = async <
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(
  file: File,
  ctx: UploadContext<TFieldValues, TName>
): Promise<void> => {
  const validationError = validateFile(file);
  if (validationError) {
    toast.error(validationError);
    return;
  }

  const blobUrl = URL.createObjectURL(file);
  ctx.setLocalPreviewUrl(blobUrl);
  ctx.setIsUploading(true);

  try {
    await executeUpload(file, blobUrl, ctx);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    ctx.setIsUploading(false);
    if (ctx.fileInputRef.current) ctx.fileInputRef.current.value = '';
  }
};

export const useCoverArtUpload = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  setValue,
  entityType,
  entityId,
  onUploadComplete,
}: UseCoverArtUploadOptions<TFieldValues, TName>): UseCoverArtUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => revokeIfSet(localPreviewUrl), [localPreviewUrl]);

  const processFile = useCallback(
    async (file: File) => {
      await runProcessFile(file, {
        entityType,
        entityId,
        name,
        setValue,
        onUploadComplete,
        setLocalPreviewUrl,
        setIsUploading,
        fileInputRef,
      });
    },
    [entityId, entityType, name, onUploadComplete, setValue]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const clearPreview = useCallback(() => {
    if (localPreviewUrl) {
      revokeIfSet(localPreviewUrl);
      setLocalPreviewUrl('');
    }
  }, [localPreviewUrl]);

  return {
    isUploading,
    localPreviewUrl,
    isDragOver,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearPreview,
  };
};
