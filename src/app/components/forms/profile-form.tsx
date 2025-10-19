'use client';

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import { changeEmailAction } from '@/app/lib/actions/change-email-action';
import { changeUsernameAction } from '@/app/lib/actions/change-username-action';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Separator } from '@radix-ui/react-separator';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Form } from '@/app/components/ui/form';
import { CheckboxField, StateField, TextField, CountryField } from '@/app/components/forms/fields';
import { splitFullName } from '@/app/lib/utils/profile-utils';
import profileSchema, { type ProfileFormData } from '@/app/lib/validation/profile-schema';
import changeEmailSchema, {
  type ChangeEmailFormData,
} from '@/app/lib/validation/change-email-schema';
import usernameSchema, {
  type ChangeUsernameFormData,
} from '@/app/lib/validation/change-username-schema';
import type { FormState } from '@/app/lib/types/form-state';
import { toast } from 'sonner';
import { GenerateUsernameButton } from '@/app/components/auth/generate-username-button';

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
  const { data: session, status, update } = useSession();
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
  const hasFormContent = useCallback(() => {
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
  }, [watchedValues]);

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
    formData.append('allowSmsNotifications', String(data.allowSmsNotifications));

    startTransition(() => {
      profileFormAction(formData);
    });
  };

  const onEditEmailSubmit = (data: ChangeEmailFormData) => {
    const formData = new FormData();
    formData.append('email', data.email);
    formData.append('confirmEmail', data.confirmEmail);
    formData.append('previousEmail', data.previousEmail ?? '');

    startTransition(() => {
      emailFormAction(formData);
    });
  };

  const onSubmitEditUsername = (data: ChangeUsernameFormData) => {
    const formData = new FormData();
    formData.append('username', data.username);
    formData.append('confirmUsername', data.confirmUsername);

    startTransition(() => {
      usernameFormAction(formData);
    });
  };

  const setFormValues = useCallback(
    (user: ProfileFormData) => {
      if (!areFormValuesSet) {
        const hasChanges = Object.keys(personalProfileForm.formState.dirtyFields).length > 0;

        if (!hasChanges && hasFormContent()) {
          personalProfileForm.reset(user);
          setAreFormValuesSet(true);
        }
      }
    },
    [areFormValuesSet, personalProfileForm, hasFormContent]
  );

  useEffect(() => {
    if (user && !areFormValuesSet) {
      const fallbackNames = splitFullName(user.name);
      setFormValues({
        firstName: user.firstName || fallbackNames.firstName || '',
        lastName: user.lastName || fallbackNames.lastName || '',
        phone: user.phone ?? '',
        addressLine1: user.addressLine1 ?? '',
        addressLine2: user.addressLine2 ?? '',
        city: user.city ?? '',
        state: user.state ?? '',
        zipCode: user.zipCode ?? '',
        country: user.country ?? '',
        allowSmsNotifications: user.allowSmsNotifications ?? false,
      });
    }
  }, [areFormValuesSet, setFormValues, user]);

  // Update email form when user session changes
  useEffect(() => {
    if (user?.email && !isEditingUserEmail) {
      changeEmailForm.setValue('email', user.email);
      changeEmailForm.setValue('previousEmail', user.email);
    }
  }, [user?.email, changeEmailForm, isEditingUserEmail]);

  // Update username form when user session changes
  useEffect(() => {
    if (user?.username && !isEditingUsername) {
      changeUsernameForm.setValue('username', user.username);
    }
  }, [user?.username, changeUsernameForm, isEditingUsername]);

  // Watch email fields and clear errors when they match
  const watchedEmail = changeEmailForm.watch('email');
  const watchedConfirmEmail = changeEmailForm.watch('confirmEmail');
  useEffect(() => {
    if (watchedEmail && watchedConfirmEmail && watchedEmail === watchedConfirmEmail) {
      changeEmailForm.clearErrors('confirmEmail');
    }
  }, [watchedEmail, watchedConfirmEmail, changeEmailForm]);

  // Watch username fields and clear errors when they match
  const watchedUsername = changeUsernameForm.watch('username');
  const watchedConfirmUsername = changeUsernameForm.watch('confirmUsername');
  useEffect(() => {
    if (watchedUsername && watchedConfirmUsername && watchedUsername === watchedConfirmUsername) {
      changeUsernameForm.clearErrors('confirmUsername');
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
      // Reset the editing state after successful update
      setIsEditingUsername(false);
      // Update the session to reflect the new username
      void update();
    }
  }, [
    formState.success,
    formState.errors,
    emailFormState.success,
    usernameFormState.success,
    update,
  ]);

  if (status === 'loading' || !user) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleEditFieldButtonClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const target = event.target as HTMLButtonElement;
    const fieldName = target.getAttribute('data-field');

    if (fieldName === 'email') {
      setIsEditingUserEmail(!isEditingUserEmail);
    } else if (fieldName === 'username') {
      setIsEditingUsername(!isEditingUsername);
    }
  }

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...personalProfileForm}>
            <form
              onSubmit={personalProfileForm.handleSubmit(onSubmitPersonalProfileForm)}
              className="space-y-4"
              data-testid="form"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  control={personalProfileForm.control}
                  name="firstName"
                  label="First Name"
                  placeholder="John"
                />
                <TextField
                  control={personalProfileForm.control}
                  name="lastName"
                  label="Last Name"
                  placeholder="Doe"
                />
              </div>
              <TextField
                control={personalProfileForm.control}
                name="phone"
                label="Phone Number"
                placeholder="+1 (555) 000-0000"
                type="tel"
              />
              <TextField
                control={personalProfileForm.control}
                name="addressLine1"
                label="Address Line 1"
                placeholder="123 Main St"
              />
              <TextField
                control={personalProfileForm.control}
                name="addressLine2"
                label="Address Line 2"
                placeholder="Apt 4B"
              />
              <div className="grid gap-4 md:grid-cols-3">
                <TextField
                  control={personalProfileForm.control}
                  name="city"
                  label="City"
                  placeholder="New York"
                />
                <StateField control={personalProfileForm.control} />
                <TextField
                  control={personalProfileForm.control}
                  name="zipCode"
                  label="ZIP Code"
                  placeholder="10001"
                />
              </div>
              <CountryField control={personalProfileForm.control} />
              <CheckboxField
                control={personalProfileForm.control}
                name="allowSmsNotifications"
                label="Allow SMS notifications"
                id="allowSmsNotifications"
              />
              <Button type="submit" disabled={isPending || isTransitionPending}>
                {isPending || isTransitionPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Separator />

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>Manage your email address</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...changeEmailForm}>
            <form
              onSubmit={changeEmailForm.handleSubmit(onEditEmailSubmit)}
              className="space-y-4"
              data-testid="form"
            >
              <TextField
                control={changeEmailForm.control}
                name="email"
                label="Email"
                placeholder="john@example.com"
                type="email"
                disabled={!isEditingUserEmail}
              />
              {isEditingUserEmail && (
                <>
                  <TextField
                    control={changeEmailForm.control}
                    name="confirmEmail"
                    label="Confirm Email"
                    placeholder="john@example.com"
                    type="email"
                  />
                  <input type="hidden" {...changeEmailForm.register('previousEmail')} />
                </>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEditFieldButtonClick}
                  data-field="email"
                >
                  {isEditingUserEmail ? 'Cancel' : 'Edit Email'}
                </Button>
                {isEditingUserEmail && (
                  <Button type="submit" disabled={isEmailPending || isTransitionPending}>
                    {isEmailPending || isTransitionPending ? 'Saving...' : 'Save Email'}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Separator />

      {/* Username */}
      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>Update your username</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...changeUsernameForm}>
            <form
              onSubmit={changeUsernameForm.handleSubmit(onSubmitEditUsername)}
              className="space-y-4"
              data-testid="form"
            >
              <TextField
                control={changeUsernameForm.control}
                name="username"
                label="Username"
                placeholder="johndoe"
                disabled={!isEditingUsername}
              />
              {isEditingUsername && (
                <>
                  <TextField
                    control={changeUsernameForm.control}
                    name="confirmUsername"
                    label="Confirm Username"
                    placeholder="johndoe"
                  />
                  <GenerateUsernameButton
                    form={changeUsernameForm}
                    fieldsToPopulate={['username', 'confirmUsername']}
                  />
                </>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEditFieldButtonClick}
                  data-field="username"
                >
                  {isEditingUsername ? 'Cancel' : 'Edit Username'}
                </Button>
                {isEditingUsername && (
                  <Button type="submit" disabled={isUsernamePending || isTransitionPending}>
                    {isUsernamePending || isTransitionPending ? 'Saving...' : 'Save Username'}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
