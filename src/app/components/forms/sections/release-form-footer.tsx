/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { EntityDeleteButton } from '@/app/components/forms/entity-delete-button';
import { Button } from '@/app/components/ui/button';
import { CardFooter } from '@/app/components/ui/card';

interface ReleaseFormFooterProps {
  isEditMode: boolean;
  releaseId: string | null;
  isPublished: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  onPublish: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

const EditModeActions = ({
  releaseId,
  isPublished,
  isSubmitting,
  isDirty,
  onPublish,
  onDelete,
}: Omit<ReleaseFormFooterProps, 'isEditMode'>): React.ReactElement => (
  <>
    {releaseId && (
      <EntityDeleteButton
        label="Delete Release"
        title="Delete this release?"
        description="This permanently removes the release and its files (digital formats and images) and cannot be undone."
        successMessage="Release deleted successfully"
        failureMessage="Failed to delete release"
        redirectTo="/admin/releases"
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
}: Pick<ReleaseFormFooterProps, 'isSubmitting' | 'onPublish'>): React.ReactElement => (
  <>
    <Button type="button" disabled={isSubmitting} onClick={onPublish}>
      Create &amp; Publish
    </Button>
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Creating...' : 'Create'}
    </Button>
  </>
);

export const ReleaseFormFooter = ({
  isEditMode,
  releaseId,
  isPublished,
  isSubmitting,
  isDirty,
  onPublish,
  onDelete,
}: ReleaseFormFooterProps): React.ReactElement => (
  <CardFooter className="flex justify-end gap-4">
    {isEditMode ? (
      <EditModeActions
        releaseId={releaseId}
        isPublished={isPublished}
        isSubmitting={isSubmitting}
        isDirty={isDirty}
        onPublish={onPublish}
        onDelete={onDelete}
      />
    ) : (
      <CreateModeActions isSubmitting={isSubmitting} onPublish={onPublish} />
    )}
  </CardFooter>
);
