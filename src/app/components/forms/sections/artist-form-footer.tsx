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
  /** Whether a display image is chosen — publishing needs one (ADR-0019). */
  canPublish: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  onPublish: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
}

const PUBLISH_REASON_ID = 'artist-publish-reason';

/**
 * Publishing needs a chosen display image (ADR-0019); the button says why
 * while there is none. The service refuses the same way.
 */
const PublishButton = ({
  isPublished,
  canPublish,
  isSubmitting,
  onPublish,
}: Pick<
  ArtistFormFooterProps,
  'isPublished' | 'canPublish' | 'isSubmitting' | 'onPublish'
>): React.ReactElement => {
  const needsImage = !isPublished && !canPublish;
  return (
    <>
      {needsImage && (
        <p id={PUBLISH_REASON_ID} className="text-muted-foreground self-center text-sm">
          Choose at least one display image before publishing.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={isSubmitting || isPublished || needsImage}
        aria-describedby={needsImage ? PUBLISH_REASON_ID : undefined}
        onClick={onPublish}
      >
        {isPublished ? 'Published' : 'Publish'}
      </Button>
    </>
  );
};

const EditModeActions = ({
  artistId,
  isPublished,
  canPublish,
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
    <PublishButton
      isPublished={isPublished}
      canPublish={canPublish}
      isSubmitting={isSubmitting}
      onPublish={onPublish}
    />
    <Button type="submit" disabled={isSubmitting || !isDirty}>
      {isSubmitting ? 'Saving...' : 'Save'}
    </Button>
  </>
);

/**
 * Create mode saves an unpublished artist; it is published from the edit
 * form once it has a chosen display image (ADR-0019).
 */
const CreateModeActions = ({
  isSubmitting,
}: Pick<ArtistFormFooterProps, 'isSubmitting'>): React.ReactElement => (
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Creating...' : 'Create'}
  </Button>
);

export const ArtistFormFooter = ({
  isEditMode,
  artistId,
  isPublished,
  canPublish,
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
        canPublish={canPublish}
        isSubmitting={isSubmitting}
        isDirty={isDirty}
        onPublish={onPublish}
        onDelete={onDelete}
      />
    ) : (
      <CreateModeActions isSubmitting={isSubmitting} />
    )}
  </div>
);
