'use client';

import { useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { generateUsername } from 'unique-username-generator';
import { cn } from '@/app/lib/utils';
import type { UseFormReturn, FieldValues, Path } from 'react-hook-form';

interface UsernameGeneratorProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  fieldsToPopulate: [Path<T>, Path<T>]; // [username, confirmUsername]
  isLoading?: boolean;
  wasSuccessful?: boolean;
}

export const GenerateUsernameButton = <T extends FieldValues>({
  form,
  fieldsToPopulate,
  isLoading = false,
  wasSuccessful = false,
}: UsernameGeneratorProps<T>) => {
  const [isConfirmUsernameCleared, setIsConfirmUsernameCleared] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateUsername = async () => {
    setIsGenerating(true);

    // Generate a random username
    const newUsername = generateUsername('', 4);

    // Update both username and confirmUsername fields
    form.setValue(fieldsToPopulate[0], newUsername as T[Path<T>], {
      shouldValidate: true,
      shouldDirty: true,
    });

    form.setValue(fieldsToPopulate[1], newUsername as T[Path<T>], {
      shouldValidate: true,
      shouldDirty: true,
    });

    // Trigger validation to clear any errors
    await form.trigger(fieldsToPopulate);

    // Stop generating animation after a short delay
    setTimeout(() => setIsGenerating(false), 500);
  };

  const usernameValue = form.getValues(fieldsToPopulate[0]);
  const confirmUsernameValue = form.getValues(fieldsToPopulate[1]);

  // Reset generating state when form succeeds
  useEffect(() => {
    if (wasSuccessful) {
      // Use a microtask to avoid setState during render
      Promise.resolve().then(() => setIsGenerating(false));
    }
  }, [wasSuccessful]);

  useEffect(() => {
    // Clear out confirm username from last generation if usernames don't match
    if (!isConfirmUsernameCleared && usernameValue !== confirmUsernameValue) {
      // Use a microtask to avoid setState during render
      Promise.resolve().then(() => {
        form.setValue(fieldsToPopulate[1], '' as T[Path<T>], {
          shouldValidate: false,
          shouldDirty: false,
        });
        setIsConfirmUsernameCleared(true);
      });
    }
  }, [form, fieldsToPopulate, isConfirmUsernameCleared, usernameValue, confirmUsernameValue]);

  return (
    <Button
      type="button"
      variant="link"
      onClick={handleGenerateUsername}
      className="mt-2 flex items-center gap-2"
      aria-label="Generate random username"
      disabled={isLoading || isGenerating}
    >
      Generate random username
      <RefreshCwIcon
        className={cn('size-4', (isGenerating || isLoading) && 'animate-spin')}
        aria-hidden="true"
      />
    </Button>
  );
};
