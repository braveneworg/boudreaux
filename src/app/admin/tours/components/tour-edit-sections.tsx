/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TourDateList } from '@/app/admin/tours/components/tour-date-list';
import {
  TourImageUpload,
  type StoredTourImage,
} from '@/app/admin/tours/components/tour-image-upload';
import { Separator } from '@/app/components/ui/separator';

interface TourEditSectionsProps {
  isEditMode: boolean;
  tourId: string | undefined;
  tourImages: StoredTourImage[];
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
}: TourEditSectionsProps) => {
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
          owner={{ kind: 'tour', id: tourId }}
          initialImages={tourImages}
          onUploadComplete={onUploadComplete}
          disabled={isSubmitting || isDeletingTour}
        />
      </section>
    </>
  );
};
