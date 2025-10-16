'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState } from 'react';
import profileSchema, { type ProfileFormData } from '@/app/lib/validation/profile-schema';
import changeEmailSchema, { type ChangeEmailFormData } from '@/app/lib/validation/change-email-schema';
import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import type { FormState } from '@/app/lib/types/form-state';
import { splitFullName } from '@/app/lib/utils/profile-utils';

import { Form } from '@/app/components/ui/form';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { AlertCircle, CircleCheck } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { useSession } from 'next-auth/react';
import { TextField, CheckboxField, StateField, CountryField } from './fields';
import { changeEmailAction } from '@/app/lib/actions/change-email-action';

const initialFormState: FormState = {
  errors: {},
  fields: {},
  success: false,
};

export default function ProfileForm() {
  const [formState, profileFormAction, isPending] = useActionState(updateProfileAction, initialFormState);
  const [, emailFormAction, isEmailPending] = useActionState(changeEmailAction, initialFormState);
  const [isTransitionPending, startTransition] = useTransition();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const { data: session, status } = useSession();
  const user = session?.user;
  const [areFormValuesSet, setAreFormValuesSet] = useState(false);
  const [isEditingUserEmail, setIsEditingUserEmail] = useState(false);

  // Use direct firstName/lastName fields, with fallback to splitting the name
  const fallbackNames = splitFullName(user?.name);
  const firstName = user?.firstName || fallbackNames.firstName || '';
  const lastName = user?.lastName || fallbackNames.lastName || '';

  const personalProfileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: firstName,
      lastName: lastName,
      phone: user?.phone ?? '',
      addressLine1: user?.addressLine1 ?? '',
      addressLine2: user?.addressLine2 ?? '',
      city: user?.city ?? '',
      state: user?.state ?? '',
      zipCode: user?.zipCode ?? '',
      country: user?.country ?? '',
      allowSmsNotifications: user?.allowSmsNotifications ?? false,
    },
  });

  const changeEmailForm = useForm<ChangeEmailFormData>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      email: user?.email ?? '',
      confirmEmail: '',
      previousEmail: user?.email ?? '',
    },
  });

  // Watch all form values to check if form has any content
  const watchedValues = personalProfileForm.watch();

  // Check if all personal profile fields are empty
  const hasFormContent = () => {
    const values = watchedValues;
    return !!(
      values.firstName?.trim() ||
      values.lastName?.trim() ||
      values.phone?.trim() ||
      values.addressLine1?.trim() ||
      values.addressLine2?.trim() ||
      values.city?.trim() ||
      values.state?.trim() ||
      values.zipCode?.trim() ||
      values.country?.trim() ||
      values.allowSmsNotifications
    );
  };

  const onSubmitPersonalProfileForm = (data: ProfileFormData) => {
    const formData = new FormData();
    formData.append('firstName', data.firstName || '');
    formData.append('lastName', data.lastName || '');
    formData.append('phone', data.phone || '');
    formData.append('addressLine1', data.addressLine1 || '');
    formData.append('addressLine2', data.addressLine2 || '');
    formData.append('city', data.city || '');
    formData.append('state', data.state || '');
    formData.append('zipCode', data.zipCode || '');
    formData.append('country', data.country || '');
    formData.append('allowSmsNotifications', data.allowSmsNotifications ? 'true' : 'false');

    // Use startTransition to properly handle the async action
    startTransition(() => {
      profileFormAction(formData);
    });
  };

  const handleEditEmailSubmit = (data: ChangeEmailFormData) => {
    if (data.email === user?.email) {
      // No change in email, do nothing
      setIsEditingUserEmail(false);
      return;
    }

    const formData = new FormData();
    formData.append('email', data.email || '');
    formData.append('confirmEmail', data.confirmEmail || '');
    formData.append('previousEmail', user?.email || '');
    // Use startTransition to properly handle the async action
    startTransition(async () => {
      await emailFormAction(formData);
    });
  };

  const setFormValues = useCallback((user: ProfileFormData) => {
    if (user && !areFormValuesSet) {
      Object.entries(user).forEach(([key, value]) => {
        // Only set the form value if the user has interacted with the form
        if (hasUserInteracted) return;

        // Ensure the key exists in the form schema
        if (key in watchedValues) {
          // For boolean fields, ensure proper boolean conversion
          if (key === 'allowSmsNotifications') {
            if (value === 'true' || value === true) {
              personalProfileForm.setValue(key as keyof ProfileFormData, true);
            } else {
              personalProfileForm.setValue(key as keyof ProfileFormData, false);
            }
          } else {
            personalProfileForm.setValue(key as keyof ProfileFormData, value as unknown as string);
          }
        }
      });
      setAreFormValuesSet(true);
    }
  }, [areFormValuesSet, hasUserInteracted, watchedValues, personalProfileForm]);

  useEffect(() => {
    if (!areFormValuesSet) {
      // Get the current user values to bind to the form
      setFormValues(user as ProfileFormData);
    }
  }, [areFormValuesSet, personalProfileForm.formState.dirtyFields, setFormValues, user]);


  if (status === 'loading' || !user) {
    return (
      <div className='flex flex-col flex-wrap'>
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full mb-4" />
        ))}
      </div>
    );
  }

  function handleEditEmailClick(): void {
    setIsEditingUserEmail(!isEditingUserEmail);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information (Optional)</CardTitle>
          <CardDescription>
            Update your personal details and contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formState.success && (
            <Alert className="mb-6">
              <CircleCheck />
              <AlertDescription>
                Your profile has been updated successfully.
              </AlertDescription>
            </Alert>
          )}

          {formState.errors?.general && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle />
              <AlertDescription>
                {formState.errors.general[0]}
              </AlertDescription>
            </Alert>
          )}

          <Form {...personalProfileForm}>
            <form onSubmit={personalProfileForm.handleSubmit(onSubmitPersonalProfileForm)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextField
                  control={personalProfileForm.control}
                  name="firstName"
                  label="First Name"
                  placeholder="Enter your first name"
                  onUserInteraction={() => setHasUserInteracted(true)}
                  setValue={personalProfileForm.setValue}
                />

                <TextField
                  control={personalProfileForm.control}
                  name="lastName"
                  label="Last Name"
                  placeholder="Enter your last name"
                  onUserInteraction={() => setHasUserInteracted(true)}
                  setValue={personalProfileForm.setValue}
                />
              </div>

              <TextField
                control={personalProfileForm.control}
                name="phone"
                label="Phone Number"
                placeholder="(555) 123-4567"
                type="tel"
                onUserInteraction={() => setHasUserInteracted(true)}
                setValue={personalProfileForm.setValue}
              />

              <CheckboxField
                control={personalProfileForm.control}
                name="allowSmsNotifications"
                id="allow-sms-notifications"
                label={
                  <>
                    <strong>Allow us to send text messages to your mobile phone occasionally?</strong>
                    <br />
                    <em className='inline-block mt-3'>(Carrier charges may apply)</em>
                  </>
                }
                onUserInteraction={() => setHasUserInteracted(true)}
                setValue={personalProfileForm.setValue}
              />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Address Information</h3>

                <TextField
                  control={personalProfileForm.control}
                  name="addressLine1"
                  label="Address"
                  placeholder="123 Main Street"
                  onUserInteraction={() => setHasUserInteracted(true)}
                  setValue={personalProfileForm.setValue}
                />

                <TextField
                  control={personalProfileForm.control}
                  name="addressLine2"
                  label="Address Line 2"
                  placeholder="Apartment, suite, unit, etc."
                  onUserInteraction={() => setHasUserInteracted(true)}
                  setValue={personalProfileForm.setValue}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <TextField
                    control={personalProfileForm.control}
                    name="city"
                    label="City"
                    placeholder="New York"
                    onUserInteraction={() => setHasUserInteracted(true)}
                    setValue={personalProfileForm.setValue}
                  />

                  <StateField
                    control={personalProfileForm.control}
                    onUserInteraction={() => setHasUserInteracted(true)}
                    setValue={personalProfileForm.setValue}
                  />

                  <TextField
                    control={personalProfileForm.control}
                    name="zipCode"
                    label="ZIP / Postal Code"
                    placeholder="12345"
                    onUserInteraction={() => setHasUserInteracted(true)}
                    setValue={personalProfileForm.setValue}
                  />
                </div>

                <CountryField
                  control={personalProfileForm.control}
                  onUserInteraction={() => setHasUserInteracted(true)}
                  setValue={personalProfileForm.setValue}
                />
              </div>

              <Button
                type="submit"
                disabled={!personalProfileForm.formState.isDirty || isPending || isTransitionPending || !hasUserInteracted || !hasFormContent()}
              >
                {isPending || isTransitionPending ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Manage your account credentials and preferences. <strong>Note:</strong> <em>Changing your email or username</em> will require you to sign in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...changeEmailForm}>
            <form className="flex flex-wrap items-center justify-between" onSubmit={changeEmailForm.handleSubmit(handleEditEmailSubmit)}>
              <div className="flex font-medium">Email Address</div>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={handleEditEmailClick}>
                  { isEditingUserEmail ? 'Cancel' : 'Change' }
                </Button>
                <Button
                  size="sm"
                  disabled={
                    Object.keys(changeEmailForm.formState.errors).length > 0 ||
                    isPending ||
                    isEmailPending ||
                    isTransitionPending ||
                    !isEditingUserEmail ||
                    !changeEmailForm.formState.isDirty
                  }
                >
                  {isPending || isEmailPending || isTransitionPending ? 'Updating...' : 'Update Email'}
                </Button>
              </div>
            {!isEditingUserEmail && <div className="text-sm text-muted-foreground w-full">{user.email}</div>}
            {isEditingUserEmail && <div className="text-sm text-muted-foreground w-full space-y-3 mt-2">
              <TextField
                control={changeEmailForm.control}
                name="email"
                label="Email"
                labelClassName="sr-only"
                placeholder="Enter your email address"
                setValue={changeEmailForm.setValue}
              />
              <TextField
                control={changeEmailForm.control}
                name="confirmEmail"
                label="Confirm Email"
                labelClassName="sr-only"
                placeholder="Confirm your email address"
                setValue={changeEmailForm.setValue}
              />
            </div>}
            </form>
          </Form>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Username</div>
              <div className="text-sm text-muted-foreground">
                {`@${user.username}` || 'Not set'}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm">
              Change
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}