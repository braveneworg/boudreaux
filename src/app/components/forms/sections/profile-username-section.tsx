/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { GenerateUsernameButton } from '@/app/components/auth/generate-username-button';
import { TextField } from '@/app/components/forms/fields';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import type { ChangeUsernameFormData } from '@/lib/types/form-data';
import { Separator } from '@/ui/separator';

import type { UseFormReturn } from 'react-hook-form';

const usernameFieldsToPopulate = ['username', 'confirmUsername'] as const;

interface ProfileUsernameSectionProps {
  form: UseFormReturn<ChangeUsernameFormData>;
  onSubmit: (data: ChangeUsernameFormData) => void;
  isEditing: boolean;
  isPending: boolean;
  isTransitionPending: boolean;
  wasSuccessful: boolean;
  onEditToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ProfileUsernameSection = ({
  form,
  onSubmit,
  isEditing,
  isPending,
  isTransitionPending,
  wasSuccessful,
  onEditToggle,
}: ProfileUsernameSectionProps): React.ReactElement => {
  const isDirty = form.formState.isDirty;
  const isSaving = isPending || isTransitionPending;

  return (
    <Card className="bg-menu-item-tan-100 relative rounded-none border-2 border-black shadow-[6px_6px_0_0_var(--card-accent)]">
      <CardContent className="p-6 sm:p-8">
        <h2 className="font-fake-four-cutout mb-4 text-2xl tracking-wide text-black uppercase">
          Username
        </h2>

        <Separator className="mb-4" />

        <p className="text-muted-foreground mb-6 text-sm">Update your username</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form">
            <TextField
              control={form.control}
              name="username"
              label="Username"
              placeholder="johndoe"
              disabled={!isEditing}
            />
            {isEditing && (
              <>
                <TextField
                  control={form.control}
                  name="confirmUsername"
                  label="Confirm Username"
                  placeholder="johndoe"
                />
                <GenerateUsernameButton
                  form={form}
                  fieldsToPopulate={usernameFieldsToPopulate}
                  isLoading={isSaving}
                  wasSuccessful={wasSuccessful}
                />
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onEditToggle} data-field="username">
                {isEditing ? 'Cancel' : 'Edit Username'}
              </Button>
              {isEditing && (
                <Button type="submit" disabled={!isDirty || isSaving}>
                  {isSaving ? 'Saving...' : 'Save Username'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
