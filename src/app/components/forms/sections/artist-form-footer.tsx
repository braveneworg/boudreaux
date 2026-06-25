/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { EntityDeleteButton } from '@/app/components/forms/entity-delete-button';
import { Button } from '@/app/components/ui/button';

interface ArtistFormFooterProps {
  isEditMode: boolean;
  artistId: string | null;
  isPublished: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  onPublish: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

const EditModeActions = ({
  artistId,
  isPublished,
  isSubmitting,
  isDirty,
  onPublish,
  onDelete,
}: Omit<ArtistFormFooterProps, 'isEditMode'>): React.ReactElement => (
  <>
    {artistId && (
      <EntityDeleteButton
        label="Delete Artist"
        title="Delete this artist?"
        description="The artist is archived and hidden from listings. You can restore it later from the artists list."
        successMessage="Artist deleted successfully"
        failureMessage="Failed to delete artist"
        redirectTo="/admin/artists"
        disabled={isSubmitting}
        onDelete={onDelete}
      />
    )}
    <Button
      type="button"
      variant="outline"
      disabled={isSubmitting || isPublished}
      onClick={onPublish}
    >
      {isPublished ? 'Published' : 'Publish'}
    </Button>
    <Button type="submit" disabled={isSubmitting || !isDirty}>
      {isSubmitting ? 'Saving...' : 'Save'}
    </Button>
  </>
);

const CreateModeActions = ({
  isSubmitting,
  onPublish,
}: Pick<ArtistFormFooterProps, 'isSubmitting' | 'onPublish'>): React.ReactElement => (
  <>
    <Button type="button" disabled={isSubmitting} onClick={onPublish}>
      Create &amp; Publish
    </Button>
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Creating...' : 'Create'}
    </Button>
  </>
);

export const ArtistFormFooter = ({
  isEditMode,
  artistId,
  isPublished,
  isSubmitting,
  isDirty,
  onPublish,
  onDelete,
}: ArtistFormFooterProps): React.ReactElement => (
  <div className="flex justify-end gap-4 pt-6">
    {isEditMode ? (
      <EditModeActions
        artistId={artistId}
        isPublished={isPublished}
        isSubmitting={isSubmitting}
        isDirty={isDirty}
        onPublish={onPublish}
        onDelete={onDelete}
      />
    ) : (
      <CreateModeActions isSubmitting={isSubmitting} onPublish={onPublish} />
    )}
  </div>
);
