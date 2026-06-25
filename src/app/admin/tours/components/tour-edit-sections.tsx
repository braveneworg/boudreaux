/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { TourDateList } from '@/app/admin/tours/components/tour-date-list';
import { TourImageUpload } from '@/app/admin/tours/components/tour-image-upload';
import { Separator } from '@/app/components/ui/separator';

interface TourImageFields {
  id: string;
  tourId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText: string | null;
  createdAt: Date;
  uploadedBy: string | null;
}

interface TourEditSectionsProps {
  isEditMode: boolean;
  tourId: string | undefined;
  tourImages: TourImageFields[];
  isSubmitting: boolean;
  isDeletingTour: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onUploadComplete: () => Promise<void>;
}

export const TourEditSections = ({
  isEditMode,
  tourId,
  tourImages,
  isSubmitting,
  isDeletingTour,
  onDialogOpenChange,
  onUploadComplete,
}: TourEditSectionsProps): JSX.Element | null => {
  if (!isEditMode || !tourId) {
    return null;
  }

  return (
    <>
      <Separator />
      <TourDateList tourId={tourId} onDialogOpenChange={onDialogOpenChange} />

      <Separator />
      <section className="space-y-4">
        <div className="space-y-2">
          <h3>Tour Images</h3>
          <p className="text-sm text-zinc-950">
            Upload images for this tour. You can add up to 10 images. Images can be reordered by
            dragging and dropping.
          </p>
        </div>
        <TourImageUpload
          tourId={tourId}
          initialImages={tourImages}
          onUploadComplete={onUploadComplete}
          disabled={isSubmitting || isDeletingTour}
        />
      </section>
    </>
  );
};
