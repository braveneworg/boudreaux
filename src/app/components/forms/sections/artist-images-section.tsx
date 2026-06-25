/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';

interface ArtistImagesSectionProps {
  images: ImageItem[];
  isSubmitting: boolean;
  onImagesChange: (images: ImageItem[]) => void;
  onReorder: (imageIds: string[]) => Promise<void>;
  onDelete: (imageId: string) => Promise<{ success: boolean; error?: string }>;
}

export const ArtistImagesSection = ({
  images,
  isSubmitting,
  onImagesChange,
  onReorder,
  onDelete,
}: ArtistImagesSectionProps): React.ReactElement => (
  <section className="space-y-4">
    <h2 className="font-semibold">Images</h2>
    <p className="text-sm text-zinc-950">
      Add images for this artist. You can drag to reorder them. Images will be uploaded after the
      artist is created or updated.
    </p>
    <ImageUploader
      images={images}
      onImagesChange={onImagesChange}
      onReorder={onReorder}
      onDelete={onDelete}
      maxImages={10}
      disabled={isSubmitting}
      label="Upload artist images"
    />
  </section>
);
