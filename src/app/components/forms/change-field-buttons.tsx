/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Button } from '../ui/button';

import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface ChangeFieldFormProps<T extends FieldValues> {
  id: string;
  isEditingField: boolean;
  handleEditFieldButtonClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  changeFieldForm: UseFormReturn<T>;
  isPending: boolean;
  isTransitionPending: boolean;
}

const ChangeFieldButtons = <T extends FieldValues>({
  id,
  isEditingField,
  handleEditFieldButtonClick,
  changeFieldForm,
  isPending,
  isTransitionPending,
}: ChangeFieldFormProps<T>) => {
  return (
    <div className="flex justify-end">
      <Button
        id={`${id}-change-button`}
        className="mr-2"
        type="button"
        variant="outline"
        size="sm"
        onClick={handleEditFieldButtonClick}
      >
        {isEditingField ? 'Cancel' : 'Change'}
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={
          Object.keys(changeFieldForm.formState.errors).length > 0 ||
          isPending ||
          isTransitionPending ||
          !isEditingField ||
          !changeFieldForm.formState.isDirty
        }
      >
        {isPending || isTransitionPending ? 'Updating...' : 'Update'}
      </Button>
    </div>
  );
};

export default ChangeFieldButtons;
