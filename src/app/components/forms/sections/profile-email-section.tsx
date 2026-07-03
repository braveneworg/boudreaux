/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { Button } from '@/app/components/ui/button';
import { Form } from '@/app/components/ui/form';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import type { ChangeEmailFormData } from '@/lib/types/form-data';
import { Separator } from '@/ui/separator';

import type { UseFormReturn } from 'react-hook-form';

interface ProfileEmailSectionProps {
  form: UseFormReturn<ChangeEmailFormData>;
  onSubmit: (data: ChangeEmailFormData) => void;
  isEditing: boolean;
  isPending: boolean;
  isTransitionPending: boolean;
  onEditToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Email opt-in toggle, rendered just above the Edit/Save buttons. */
  emailOptIn?: React.ReactNode;
}

export const ProfileEmailSection = ({
  form,
  onSubmit,
  isEditing,
  isPending,
  isTransitionPending,
  onEditToggle,
  emailOptIn,
}: ProfileEmailSectionProps): React.ReactElement => {
  const isDirty = form.formState.isDirty;
  const isSaving = isPending || isTransitionPending;

  return (
    <ZinePanel accent="kraft">
      <h2 className="font-fake-four-cutout mb-4 text-2xl tracking-wide text-black uppercase">
        Email Address
      </h2>

      <Separator className="mb-4" />

      <p className="text-muted-foreground mb-6 text-sm">
        Manage your email address. This will not be shared publicly with anyone. We may contact you
        from time to time to keep you up-to-date.
      </p>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6"
          data-testid="form"
          noValidate
        >
          <TextField
            control={form.control}
            name="email"
            label="Email"
            placeholder="john@example.com"
            type="email"
            disabled={!isEditing}
          />
          {isEditing && (
            <>
              <TextField
                control={form.control}
                name="confirmEmail"
                label="Confirm Email"
                placeholder="john@example.com"
                type="email"
              />
              <input type="hidden" {...form.register('previousEmail')} />
            </>
          )}
          {emailOptIn}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onEditToggle} data-field="email">
              {isEditing ? 'Cancel' : 'Edit Email'}
            </Button>
            {isEditing && (
              <Button type="submit" disabled={!isDirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save Email'}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </ZinePanel>
  );
};
