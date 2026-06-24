/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { DownloadAnalyticsDashboard } from '@/app/components/download-analytics-dashboard';
import { DigitalFormatsAccordion } from '@/app/components/forms/digital-formats-accordion';
import { ReleaseBasicInfoSection } from '@/app/components/forms/sections/release-basic-info-section';
import { ReleaseCreditsSection } from '@/app/components/forms/sections/release-credits-section';
import { ReleaseFormatsSection } from '@/app/components/forms/sections/release-formats-section';
import { ReleaseImagesSection } from '@/app/components/forms/sections/release-images-section';
import { CardContent } from '@/app/components/ui/card';
import { type ImageItem } from '@/app/components/ui/image-uploader';
import { Separator } from '@/app/components/ui/separator';
import type { Format } from '@/lib/types/media-models';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import type {
  ExistingFormat,
  ExtractedAudioMetadata,
  ReleaseAutoCreatedPayload,
} from '../digital-formats/types';
import type { Control, UseFormSetValue } from 'react-hook-form';

interface ReleaseFormContentProps {
  control: Control<ReleaseFormData>;
  setValue: UseFormSetValue<ReleaseFormData>;
  isSubmitting: boolean;
  isEditMode: boolean;
  initialReleaseId: string | undefined;
  releaseId: string | null;
  preGeneratedId: string;
  existingFormats: ExistingFormat[];
  formats: string[] | undefined;
  watchedArtistIds: string[] | undefined;
  images: ImageItem[];
  onSelectDate: (dateString: string, fieldName: string) => void;
  onCoverArtUploadComplete: ((cdnUrl: string) => Promise<void>) | undefined;
  onFormatChange: (format: Format, checked: boolean) => void;
  onReleaseAutoCreated: (result: ReleaseAutoCreatedPayload) => void;
  onMetadataExtracted: (metadata: ExtractedAudioMetadata) => void;
  onImagesChange: (images: ImageItem[]) => void;
  onReorder: (imageIds: string[]) => Promise<void>;
  onDelete: (imageId: string) => Promise<{ success: boolean; error?: string }>;
}

export const ReleaseFormContent = ({
  control,
  setValue,
  isSubmitting,
  isEditMode,
  initialReleaseId,
  releaseId,
  preGeneratedId,
  existingFormats,
  formats,
  watchedArtistIds,
  images,
  onSelectDate,
  onCoverArtUploadComplete,
  onFormatChange,
  onReleaseAutoCreated,
  onMetadataExtracted,
  onImagesChange,
  onReorder,
  onDelete,
}: ReleaseFormContentProps): React.ReactElement => (
  <CardContent className="space-y-6">
    {/* Digital Formats Section - Always visible */}
    <section className="space-y-4">
      <DigitalFormatsAccordion
        releaseId={preGeneratedId}
        existingFormats={existingFormats}
        onReleaseAutoCreated={!isEditMode ? onReleaseAutoCreated : undefined}
        onMetadataExtracted={onMetadataExtracted}
      />
    </section>

    <Separator />

    <ReleaseBasicInfoSection
      control={control}
      setValue={setValue}
      isSubmitting={isSubmitting}
      releaseId={releaseId}
      preGeneratedId={preGeneratedId}
      watchedArtistIds={watchedArtistIds ?? []}
      onSelectDate={onSelectDate}
      onCoverArtUploadComplete={onCoverArtUploadComplete}
    />

    <Separator />

    <ReleaseFormatsSection
      formats={formats}
      isSubmitting={isSubmitting}
      onFormatChange={onFormatChange}
    />

    <Separator />

    <ReleaseImagesSection
      images={images}
      isSubmitting={isSubmitting}
      onImagesChange={onImagesChange}
      onReorder={onReorder}
      onDelete={onDelete}
    />

    <Separator />

    <ReleaseCreditsSection control={control} />

    <Separator />

    {isEditMode && initialReleaseId && (
      <>
        <Separator />

        {/* Download Analytics Section - Edit mode only */}
        <section className="space-y-4">
          <DownloadAnalyticsDashboard releaseId={initialReleaseId} />
        </section>
      </>
    )}
  </CardContent>
);
