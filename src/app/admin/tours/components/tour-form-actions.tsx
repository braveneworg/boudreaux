/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { Button } from '@/app/components/ui/button';

interface TourFormActionsProps {
  isEditMode: boolean;
  isSubmitting: boolean;
  isDeletingTour: boolean;
  isTourDateDialogOpen: boolean;
  onBack: () => void;
  onDelete: () => void;
}

export const TourFormActions = ({
  isEditMode,
  isSubmitting,
  isDeletingTour,
  isTourDateDialogOpen,
  onBack,
  onDelete,
}: TourFormActionsProps): JSX.Element => (
  <div className="flex justify-between pt-6">
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={onBack}
        disabled={isSubmitting || isDeletingTour}
      >
        Cancel
      </Button>
      {isEditMode && (
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={isSubmitting || isDeletingTour}
        >
          {isDeletingTour ? 'Deleting...' : 'Delete Tour'}
        </Button>
      )}
    </div>
    <Button type="submit" disabled={isSubmitting || isDeletingTour || isTourDateDialogOpen}>
      {isSubmitting
        ? isEditMode
          ? 'Updating...'
          : 'Creating...'
        : isEditMode
          ? 'Update Tour'
          : 'Create Tour'}
    </Button>
  </div>
);
