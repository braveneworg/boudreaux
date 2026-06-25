/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Controller } from 'react-hook-form';

import { StateField, TextField, CountryField } from '@/app/components/forms/fields';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import { ImageHeading } from '@/components/ui/image-heading';
import type { ProfileFormData } from '@/lib/types/form-data';
import { Separator } from '@/ui/separator';
import { Switch } from '@/ui/switch';

import type { UseFormReturn } from 'react-hook-form';

interface ProfilePersonalSectionProps {
  form: UseFormReturn<ProfileFormData>;
  onSubmit: (data: ProfileFormData) => void;
  isPending: boolean;
  isTransitionPending: boolean;
}

export const ProfilePersonalSection = ({
  form,
  onSubmit,
  isPending,
  isTransitionPending,
}: ProfilePersonalSectionProps): React.ReactElement => {
  const isDirty = form.formState.isDirty;
  const isSaving = isPending || isTransitionPending;

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <ImageHeading src="/media/headings/PROFILE.webp" alt="profile" imageHeight={480} priority />

        <div className="mb-1 flex items-center gap-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Profile
          </p>
        </div>

        <h2 className="mb-4 text-xl font-bold tracking-tight">Personal Information</h2>

        <Separator className="mb-4" />

        <p className="text-muted-foreground mb-6 text-sm">
          Update your personal details. This will not be shared publicly with anyone. They&apos;re
          only used to enhance your experience.
        </p>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              <TextField
                control={form.control}
                name="firstName"
                label="First Name"
                placeholder="John"
              />
              <TextField
                control={form.control}
                name="lastName"
                label="Last Name"
                placeholder="Doe"
              />
            </div>
            <TextField
              control={form.control}
              name="phone"
              label="Phone Number"
              placeholder="+1 (555) 000-0000"
              type="tel"
            />
            <TextField
              control={form.control}
              name="addressLine1"
              label="Address Line 1"
              placeholder="123 Main St"
            />
            <TextField
              control={form.control}
              name="addressLine2"
              label="Address Line 2"
              placeholder="Apt 4B"
            />
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              <TextField control={form.control} name="city" label="City" placeholder="New York" />
              <StateField control={form.control} />
              <TextField
                control={form.control}
                name="zipCode"
                label="ZIP Code"
                placeholder="10001"
              />
            </div>
            <CountryField control={form.control} />
            <div className="flex items-center rounded-lg p-4">
              <Controller
                name="allowSmsNotifications"
                control={form.control}
                render={({ field }) => (
                  <Switch
                    id="allowSmsNotifications"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div className="ml-2 space-y-0.5">
                <label htmlFor="allowSmsNotifications" className="text-sm font-medium">
                  Allow SMS notifications
                </label>
              </div>
            </div>
            <Button type="submit" disabled={!isDirty || isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
