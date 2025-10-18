'use client';

import { useLayoutEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { generateUsername } from 'unique-username-generator';
import type { UseFormReturn, FieldValues, Path } from 'react-hook-form';

interface UsernameGeneratorProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  fieldsToPopulate: [Path<T>, Path<T>]; // [username, confirmUsername]
}

export const GenerateUsernameButton = <T extends FieldValues>({
  form,
  fieldsToPopulate,
}: UsernameGeneratorProps<T>) => {
  const [isConfirmUsernameCleared, setIsConfirmUsernameCleared] = useState(false);

  const handleGenerateUsername = async () => {
    // Generate a random username
    const newUsername = generateUsername('', 4);

    // Update both username and confirmUsername fields
    form.setValue(fieldsToPopulate[0], newUsername as never, {
      shouldValidate: true,
      shouldDirty: true,
    });

    form.setValue(fieldsToPopulate[1], newUsername as never, {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Trigger validation to clear any errors
    await form.trigger(fieldsToPopulate);
  };

  const usernameValue = form.getValues(fieldsToPopulate[0]);
  const confirmUsernameValue = form.getValues(fieldsToPopulate[1]);

  useLayoutEffect(() => {
    // Clear out confirm username from last generation if usernames don't match
    if (!isConfirmUsernameCleared && usernameValue !== confirmUsernameValue) {
      form.setValue(fieldsToPopulate[1], '', {
        shouldValidate: false,
        shouldDirty: false,
      });
      setIsConfirmUsernameCleared(true);
    }
  }, [form, fieldsToPopulate, isConfirmUsernameCleared, usernameValue, confirmUsernameValue]);

  return (
    <Button
      type="button"
      variant="link"
      onClick={handleGenerateUsername}
      className="mt-2 flex items-center gap-2"
    >
      Generate random username
      <RefreshCwIcon className="size-4" />
    </Button>
  );
};
