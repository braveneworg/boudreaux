'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Separator } from '@radix-ui/react-separator';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { GenerateUsernameButton } from '@/app/components/auth/generate-username-button';
import { CheckboxField, StateField, TextField, CountryField } from '@/app/components/forms/fields';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import { Skeleton } from '@/app/components/ui/skeleton';
import { changeEmailAction } from '@/app/lib/actions/change-email-action';
import { changeUsernameAction } from '@/app/lib/actions/change-username-action';
import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import type {
  ProfileFormData,
  ChangeEmailFormData,
  ChangeUsernameFormData,
} from '@/app/lib/types/form-data';
import type { FormState } from '@/app/lib/types/form-state';
import { splitFullName } from '@/app/lib/utils/auth/split-full-name';
import changeEmailSchema from '@/app/lib/validation/change-email-schema';
import usernameSchema from '@/app/lib/validation/change-username-schema';
import profileSchema from '@/app/lib/validation/profile-schema';

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

  // Memoize fallback names to prevent unnecessary recalculations
  const fallbackNames = useMemo(() => splitFullName(user?.name ?? ''), [user?.name]);
  const firstName = user?.firstName || fallbackNames.firstName || '';
  const lastName = user?.lastName || fallbackNames.lastName || '';

  const personalProfileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName,
      lastName,
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

  // Track which success states we've already handled to prevent infinite loops
  const handledSuccessStatesRef = useRef({
    profile: false,
    email: false,
    username: false,
  });

  const onSubmitPersonalProfileForm = useCallback(
    (data: ProfileFormData) => {
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
        // Reset the handled flag right before the action to ensure toast shows on this submission
        handledSuccessStatesRef.current.profile = false;
        profileFormAction(formData);
      });
    },
    [profileFormAction, startTransition]
  );

  const onEditEmailSubmit = useCallback(
    (data: ChangeEmailFormData) => {
      const formData = new FormData();
      formData.append('email', data.email);
      formData.append('confirmEmail', data.confirmEmail);
      formData.append('previousEmail', data.previousEmail ?? '');

      startTransition(() => {
        // Reset the handled flag right before the action to ensure toast shows on this submission
        handledSuccessStatesRef.current.email = false;
        emailFormAction(formData);
      });
    },
    [emailFormAction, startTransition]
  );

  const onSubmitEditUsername = useCallback(
    (data: ChangeUsernameFormData) => {
      const formData = new FormData();
      formData.append('username', data.username);
      formData.append('confirmUsername', data.confirmUsername);

      startTransition(() => {
        // Reset the handled flag right before the action to ensure toast shows on this submission
        handledSuccessStatesRef.current.username = false;
        usernameFormAction(formData);
      });
    },
    [usernameFormAction, startTransition]
  );

  // Populate form with user data when it becomes available
  useEffect(() => {
    if (user && !areFormValuesSet) {
      const fallbackNames = splitFullName(user.name ?? '');
      const hasChanges = Object.keys(personalProfileForm.formState.dirtyFields).length > 0;

      if (!hasChanges) {
        personalProfileForm.reset({
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
        setAreFormValuesSet(true);
      }
    }
  }, [user, areFormValuesSet, personalProfileForm]);

  // Update email form when user session changes
  useEffect(() => {
    if (user?.email && !isEditingUserEmail) {
      changeEmailForm.setValue('email', user.email);
      changeEmailForm.setValue('previousEmail', user.email);
    }
  }, [user?.email, isEditingUserEmail, changeEmailForm]);

  // Update username form when user session changes
  useEffect(() => {
    if (user?.username && !isEditingUsername) {
      changeUsernameForm.setValue('username', user.username);
    }
  }, [user?.username, isEditingUsername, changeUsernameForm]);

  // Watch email fields and clear errors when they match
  const watchedEmail = useWatch({
    control: changeEmailForm.control,
    name: 'email',
  });
  const watchedConfirmEmail = useWatch({
    control: changeEmailForm.control,
    name: 'confirmEmail',
  });
  useEffect(() => {
    if (watchedEmail && watchedConfirmEmail && watchedEmail === watchedConfirmEmail) {
      changeEmailForm.clearErrors('confirmEmail');
    }
  }, [watchedEmail, watchedConfirmEmail, changeEmailForm]);

  // Watch username fields and clear errors when they match
  const watchedUsername = useWatch({
    control: changeUsernameForm.control,
    name: 'username',
  });
  const watchedConfirmUsername = useWatch({
    control: changeUsernameForm.control,
    name: 'confirmUsername',
  });
  useEffect(() => {
    if (watchedUsername && watchedConfirmUsername && watchedUsername === watchedConfirmUsername) {
      changeUsernameForm.clearErrors('confirmUsername');
    }
  }, [watchedUsername, watchedConfirmUsername, changeUsernameForm]);

  // Show toast notifications for form state changes
  useEffect(() => {
    // Show success toast only when success transitions from false to true
    if (
      formState.success &&
      !handledSuccessStatesRef.current.profile &&
      !isPending &&
      !isTransitionPending
    ) {
      handledSuccessStatesRef.current.profile = true;
      toast.success('Your profile has been updated successfully.');
      // Reset to pristine state after successful save
      // Get current values to ensure they match exactly
      const currentValues = personalProfileForm.getValues();
      personalProfileForm.reset(currentValues, {
        keepDefaultValues: false,
        keepValues: true,
      });
      // Update session to reflect changes
      void update();
    }

    // Show error toast when there are errors
    if (formState.errors?.general) {
      toast.error(formState.errors.general[0]);
    }
  }, [
    formState.success,
    formState.errors,
    isPending,
    isTransitionPending,
    update,
    personalProfileForm,
  ]);

  useEffect(() => {
    if (
      emailFormState.success &&
      !handledSuccessStatesRef.current.email &&
      !isEmailPending &&
      !isTransitionPending
    ) {
      handledSuccessStatesRef.current.email = true;
      toast.success('Your email has been updated successfully.');
      // Reset editing state
      setIsEditingUserEmail(false);
      // Get current values and clear confirmEmail
      const currentValues = changeEmailForm.getValues();
      // Reset to pristine state after successful save
      changeEmailForm.reset(
        {
          ...currentValues,
          confirmEmail: '', // Clear confirmEmail after successful save
        },
        {
          keepDefaultValues: false,
          keepValues: true,
        }
      );
      // Update session
      void update();
    }
  }, [emailFormState.success, isEmailPending, isTransitionPending, update, changeEmailForm]);

  useEffect(() => {
    if (
      usernameFormState.success &&
      !handledSuccessStatesRef.current.username &&
      !isUsernamePending &&
      !isTransitionPending
    ) {
      handledSuccessStatesRef.current.username = true;
      toast.success('Your username has been updated successfully.');
      // Reset editing state
      setIsEditingUsername(false);
      // Get current values and clear confirmUsername
      const currentValues = changeUsernameForm.getValues();
      // Reset to pristine state after successful save
      changeUsernameForm.reset(
        {
          ...currentValues,
          confirmUsername: '', // Clear confirmUsername after successful save
        },
        {
          keepDefaultValues: false,
          keepValues: true,
        }
      );
      // Update session
      void update();
    }
  }, [
    usernameFormState.success,
    isUsernamePending,
    isTransitionPending,
    update,
    changeUsernameForm,
  ]);

  const handleEditFieldButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      const target = event.target as HTMLButtonElement;
      const fieldName = target.getAttribute('data-field');

      if (fieldName === 'email') {
        // Check current state before toggling
        const wasEditing = isEditingUserEmail;
        setIsEditingUserEmail((prev) => !prev);

        // Clear errors when canceling (after determining we're canceling)
        if (wasEditing) {
          changeEmailForm.clearErrors();
          changeEmailForm.setValue('confirmEmail', '');
        }
      } else if (fieldName === 'username') {
        // Check current state before toggling
        const wasEditing = isEditingUsername;
        setIsEditingUsername((prev) => !prev);

        // Clear errors when canceling (after determining we're canceling)
        if (wasEditing) {
          changeUsernameForm.clearErrors();
          changeUsernameForm.setValue('confirmUsername', '');
        }
      }
    },
    [isEditingUserEmail, isEditingUsername, changeEmailForm, changeUsernameForm]
  );

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

  const isPersonalFormDirty = personalProfileForm.formState.isDirty;
  const isEmailFormDirty = changeEmailForm.formState.isDirty;
  const isUsernameFormDirty = changeUsernameForm.formState.isDirty;

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
              <Button
                type="submit"
                disabled={!isPersonalFormDirty || isPending || isTransitionPending}
              >
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
                  <Button
                    type="submit"
                    disabled={!isEmailFormDirty || isEmailPending || isTransitionPending}
                  >
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
                    isLoading={isUsernamePending || isTransitionPending}
                    wasSuccessful={usernameFormState.success}
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
                  <Button
                    type="submit"
                    disabled={!isUsernameFormDirty || isUsernamePending || isTransitionPending}
                  >
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
