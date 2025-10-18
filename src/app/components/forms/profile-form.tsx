'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState } from 'react';
import profileSchema, { type ProfileFormData } from '@/app/lib/validation/profile-schema';
import changeEmailSchema, {
  type ChangeEmailFormData,
} from '@/app/lib/validation/change-email-schema';
import usernameSchema, {
  type ChangeUsernameFormData,
} from '@/app/lib/validation/change-username-schema';
import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import type { FormState } from '@/app/lib/types/form-state';
import { splitFullName } from '@/app/lib/utils/profile-utils';

import { Form } from '@/app/components/ui/form';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Skeleton } from '../ui/skeleton';
import { useSession } from 'next-auth/react';
import { TextField, CheckboxField, StateField, CountryField } from './fields';
import { changeEmailAction } from '@/app/lib/actions/change-email-action';
import { changeUsernameAction } from '@/app/lib/actions/change-username-action';
import { Separator } from '@radix-ui/react-separator';
import { toast } from 'sonner';
import ChangeFieldButtons from './change-email-form';

const initialFormState: FormState = {
  errors: {},
  fields: {},
  success: false,
};

export default function ProfileForm() {
  const [formState, profileFormAction, isPending] = useActionState(
    updateProfileAction,
    initialFormState
  );
  const [emailFormState, emailFormAction, isEmailPending] = useActionState(
    changeEmailAction,
    initialFormState
  );
  const [usernameFormState, usernameFormAction, isUsernamePending] = useActionState(
    changeUsernameAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const { data: session, status } = useSession();
  const user = session?.user;
  const [areFormValuesSet, setAreFormValuesSet] = useState(false);
  const [isEditingUserEmail, setIsEditingUserEmail] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);

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

  const changeUsernameForm = useForm<ChangeUsernameFormData>({
    resolver: zodResolver(usernameSchema),
    defaultValues: {
      username: user?.username ?? '',
      confirmUsername: '',
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

  const onEditEmailSubmit = (data: ChangeEmailFormData) => {
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
    startTransition(() => {
      emailFormAction(formData);
    });
  };

  const onEditUsernameSubmit = (data: ChangeUsernameFormData) => {
    if (data.username === user?.username) {
      // No change in username, do nothing
      setIsEditingUsername(false);
      return;
    }

    const formData = new FormData();
    formData.append('username', data.username || '');

    // Use startTransition to properly handle the async action
    startTransition(() => {
      usernameFormAction(formData);
    });
  };

  const setFormValues = useCallback(
    (user: ProfileFormData) => {
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
              personalProfileForm.setValue(
                key as keyof ProfileFormData,
                value as unknown as string
              );
            }
          }
        });
        setAreFormValuesSet(true);
      }
    },
    [areFormValuesSet, hasUserInteracted, watchedValues, personalProfileForm]
  );

  useEffect(() => {
    if (!areFormValuesSet) {
      // Get the current user values to bind to the form
      setFormValues(user as ProfileFormData);
    }
  }, [areFormValuesSet, personalProfileForm.formState.dirtyFields, setFormValues, user]);

  // Update email form when user session changes
  useEffect(() => {
    if (user?.username && user?.email && !isEditingUsername && !isEditingUserEmail) {
      // Only update if the current email value is different from the user's email
      const username = changeUsernameForm.getValues('username');
      if (username !== user.username) {
        changeUsernameForm.setValue('username', user.username, { shouldValidate: false });
      }
      const email = changeEmailForm.getValues('email');
      if (email !== user.email) {
        changeEmailForm.setValue('email', user.email, { shouldValidate: false });
      }
    }
  }, [
    user?.username,
    changeUsernameForm,
    isEditingUsername,
    user?.email,
    isEditingUserEmail,
    changeEmailForm,
  ]);

  // Watch email fields and clear errors when they match
  const watchedEmail = changeEmailForm.watch('email');
  const watchedConfirmEmail = changeEmailForm.watch('confirmEmail');
  useEffect(() => {
    // If both fields have values and they match, clear any existing errors
    if (watchedEmail && watchedConfirmEmail && watchedEmail === watchedConfirmEmail) {
      // Clear specific field errors for email and confirmEmail
      const currentErrors = changeEmailForm.formState.errors;

      if (currentErrors.email || currentErrors.confirmEmail) {
        // Clear the errors by triggering validation
        changeEmailForm.clearErrors(['email', 'confirmEmail']);
      }
    }
  }, [watchedEmail, watchedConfirmEmail, changeEmailForm]);

  // Watch username fields and clear errors when they match
  const watchedUsername = changeUsernameForm.watch('username');
  const watchedConfirmUsername = changeUsernameForm.watch('confirmUsername');
  useEffect(() => {
    // If both fields have values and they match, clear any existing errors
    if (watchedUsername && watchedConfirmUsername && watchedUsername === watchedConfirmUsername) {
      // Clear specific field errors for username and confirmUsername
      const currentErrors = changeUsernameForm.formState.errors;

      if (currentErrors.username || currentErrors.confirmUsername) {
        // Clear the errors by triggering validation
        changeUsernameForm.clearErrors(['username', 'confirmUsername']);
      }
    }
  }, [watchedUsername, watchedConfirmUsername, changeUsernameForm]);

  // Show toast notifications for form state changes
  useEffect(() => {
    if (formState.success) {
      toast.success('Your profile has been updated successfully.');
    }
    if (formState.errors?.general) {
      toast.error(formState.errors.general[0]);
    }
    if (emailFormState.success) {
      toast.success('Your email has been updated successfully.');
    }
    if (usernameFormState.success) {
      toast.success('Your username has been updated successfully.');
    }
  }, [formState.success, formState.errors, emailFormState.success, usernameFormState.success]);

  if (status === 'loading' || !user) {
    return (
      <div className="flex flex-col flex-wrap">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full mb-4" />
        ))}
      </div>
    );
  }

  function handleEditFieldButtonClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const id = event.currentTarget.id;
    if (id === 'change-email-change-button') {
      setIsEditingUserEmail(!isEditingUserEmail);
    } else if (id === 'change-username-change-button') {
      setIsEditingUsername(!isEditingUsername);
    }
  }

  function handleEditUsernameClick(): void {
    setIsEditingUsername(!isEditingUsername);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Information (Optional)</CardTitle>
          <CardDescription>Update your personal details and contact information.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...personalProfileForm}>
            <form
              onSubmit={personalProfileForm.handleSubmit(onSubmitPersonalProfileForm)}
              noValidate
              className="space-y-6"
            >
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
                    <strong>
                      Allow us to send text messages to your mobile phone occasionally?
                    </strong>
                    <br />
                    <em className="inline-block mt-3">(Carrier charges may apply)</em>
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
                size="sm"
                type="submit"
                disabled={
                  !personalProfileForm.formState.isDirty ||
                  isPending ||
                  isTransitionPending ||
                  !hasUserInteracted ||
                  !hasFormContent()
                }
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
            <p>Manage your account credentials and preferences.</p>
            <p>
              <strong>Note:</strong> <em>Changing your email or username</em> will require you to
              sign in again.
            </p>
            <p>Make sure you have access to messages at the new email address.</p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...changeEmailForm}>
            <form
              className="flex flex-wrap items-center justify-between"
              noValidate
              onSubmit={changeEmailForm.handleSubmit(onEditEmailSubmit)}
            >
              <div className="flex font-medium">Email Address</div>
              <ChangeFieldButtons<ChangeEmailFormData>
                id="change-email"
                isEditingField={isEditingUserEmail}
                handleEditFieldButtonClick={handleEditFieldButtonClick}
                changeFieldForm={changeEmailForm}
                isPending={isEmailPending}
                isTransitionPending={isTransitionPending}
              />
              {!isEditingUserEmail && (
                <div className="text-sm text-muted-foreground w-full">{user.email}</div>
              )}
              {isEditingUserEmail && (
                <div className="text-sm text-muted-foreground w-full space-y-3 mt-2">
                  <TextField
                    control={changeEmailForm.control}
                    name="email"
                    type="email"
                    label="Email"
                    labelClassName="sr-only"
                    placeholder="Enter your email address"
                    setValue={changeEmailForm.setValue}
                  />
                  <TextField
                    control={changeEmailForm.control}
                    name="confirmEmail"
                    type="email"
                    label="Confirm Email"
                    labelClassName="sr-only"
                    placeholder="Confirm your email address"
                    setValue={changeEmailForm.setValue}
                  />
                </div>
              )}
            </form>
          </Form>
          <Separator
            orientation="horizontal"
            className="flex h-[1px] bg-gray-200 mt-6 mb-3"
            decorative
          />
          <div className="flex items-center justify-between py-2">
            <div className="flex font-medium">Username</div>
            <ChangeFieldButtons<ChangeUsernameFormData>
              isEditingField={isEditingUsername}
              handleEditFieldClick={handleEditUsernameClick}
              changeFieldForm={changeUsernameForm}
              isPending={isUsernamePending}
              isTransitionPending={isTransitionPending}
            />
            {!isEditingUsername && (
              <div className="text-sm text-muted-foreground">
                {`@${user.username}` || 'Not set'}
              </div>
            )}
            {isEditingUsername && (
              <div>
                <div className="text-sm w-full space-y-3 mt-2">
                  <TextField
                    control={changeUsernameForm.control}
                    name="username"
                    type="text"
                    label="Email"
                    labelClassName="sr-only"
                    placeholder="Enter your username"
                    setValue={changeUsernameForm.setValue}
                  />
                  <TextField
                    control={changeUsernameForm.control}
                    name="confirmUsername"
                    type="text"
                    label="Confirm username"
                    labelClassName="sr-only"
                    placeholder="Confirm your username"
                    setValue={changeUsernameForm.setValue}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
