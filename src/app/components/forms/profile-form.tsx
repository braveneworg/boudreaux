/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Separator } from '@radix-ui/react-separator';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ConnectedAccountsSection } from '@/app/components/forms/connected-accounts-section';
import { useMatchingFieldErrorClear } from '@/app/components/forms/hooks/use-form-state-sync';
import { ProfileEmailSection } from '@/app/components/forms/sections/profile-email-section';
import { ProfilePersonalSection } from '@/app/components/forms/sections/profile-personal-section';
import { ProfileUsernameSection } from '@/app/components/forms/sections/profile-username-section';
import { Card, CardContent, CardHeader } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { changeEmailAction } from '@/lib/actions/change-email-action';
import { changeUsernameAction } from '@/lib/actions/change-username-action';
import { updateProfileAction } from '@/lib/actions/update-profile-action';
import type {
  ProfileFormData,
  ChangeEmailFormData,
  ChangeUsernameFormData,
} from '@/lib/types/form-data';
import type { FormState } from '@/lib/types/form-state';
import { splitFullName } from '@/lib/utils/split-full-name';
import { changeEmailSchema } from '@/lib/validation/change-email-schema';
import { changeUsernameSchema as usernameSchema } from '@/lib/validation/change-username-schema';
import { profileSchema } from '@/lib/validation/profile-schema';

import type { UseFormReturn } from 'react-hook-form';

const initialFormState: FormState = {
  fields: {},
  success: false,
};

type SessionUser = NonNullable<ReturnType<typeof useSession>['data']>['user'];

const EMPTY_PROFILE_DEFAULTS: ProfileFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  allowSmsNotifications: false,
};

const buildAddressDefaults = (
  user: SessionUser
): Pick<
  ProfileFormData,
  'phone' | 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'zipCode' | 'country'
> => ({
  phone: user.phone ?? '',
  addressLine1: user.addressLine1 ?? '',
  addressLine2: user.addressLine2 ?? '',
  city: user.city ?? '',
  state: user.state ?? '',
  zipCode: user.zipCode ?? '',
  country: user.country ?? '',
});

const buildProfileDefaults = (user: SessionUser | undefined): ProfileFormData => {
  if (!user) return EMPTY_PROFILE_DEFAULTS;
  return {
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    allowSmsNotifications: user.allowSmsNotifications ?? false,
    ...buildAddressDefaults(user),
  };
};

const buildEmailDefaults = (user: SessionUser | undefined): ChangeEmailFormData => ({
  email: user?.email ?? '',
  confirmEmail: '',
  previousEmail: user?.email ?? '',
});

const buildUsernameDefaults = (user: SessionUser | undefined): ChangeUsernameFormData => ({
  username: user?.username ?? '',
  confirmUsername: '',
});

const buildProfileFormData = (data: ProfileFormData): FormData => {
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
  return formData;
};

const buildNameDefaults = (user: SessionUser): Pick<ProfileFormData, 'firstName' | 'lastName'> => {
  const fallbackNames = splitFullName(user.name ?? '');
  return {
    firstName: user.firstName || fallbackNames.firstName || '',
    lastName: user.lastName || fallbackNames.lastName || '',
  };
};

const resetProfileFromSession = (user: SessionUser, form: UseFormReturn<ProfileFormData>): void => {
  form.reset(
    { ...buildProfileDefaults(user), ...buildNameDefaults(user) },
    { keepDefaultValues: false }
  );
};

const finalizeProfileSuccess = (form: UseFormReturn<ProfileFormData>, update: () => void): void => {
  toast.success('Your profile has been updated successfully.');
  const currentValues = form.getValues();
  form.reset(currentValues, { keepDefaultValues: false, keepValues: true });
  void update();
};

const finalizeEmailSuccess = (
  form: UseFormReturn<ChangeEmailFormData>,
  update: () => void
): void => {
  toast.success('Your email has been updated successfully.');
  const currentValues = form.getValues();
  form.reset(
    { ...currentValues, confirmEmail: '' },
    { keepDefaultValues: false, keepValues: true }
  );
  void update();
};

const finalizeUsernameSuccess = (
  form: UseFormReturn<ChangeUsernameFormData>,
  update: () => void
): void => {
  toast.success('Your username has been updated successfully.');
  const currentValues = form.getValues();
  form.reset(
    { ...currentValues, confirmUsername: '' },
    { keepDefaultValues: false, keepValues: true }
  );
  void update();
};

const showUsernameErrorToasts = (errors: Record<string, string[]>): void => {
  const generalErrors = errors.general;
  if (generalErrors && generalErrors.length > 0) {
    toast.error(generalErrors[0], { id: `username-error-${generalErrors[0]}` });
  }

  const fieldErrors = errors.username;
  if (fieldErrors && fieldErrors.length > 0) {
    fieldErrors.forEach((fieldError) => {
      toast.error(fieldError, { id: `username-field-error-${fieldError}` });
    });
  }
};

const ProfileFormSkeleton = (): React.ReactElement => (
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

export const ProfileForm = (): React.ReactElement => {
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
  const { data: session, update, status } = useSession();
  const user = session?.user;
  const [areFormValuesSet, setAreFormValuesSet] = useState(false);
  const [isEditingUserEmail, setIsEditingUserEmail] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);

  const personalProfileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: buildProfileDefaults(user),
  });

  const changeEmailForm = useForm<ChangeEmailFormData>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: buildEmailDefaults(user),
  });

  const changeUsernameForm = useForm<ChangeUsernameFormData>({
    resolver: zodResolver(usernameSchema),
    defaultValues: buildUsernameDefaults(user),
  });

  // Track which success states we've already handled to prevent infinite loops
  const handledSuccessStatesRef = useRef({
    profile: false,
    email: false,
    username: false,
  });

  const onSubmitPersonalProfileForm = useCallback(
    (data: ProfileFormData) => {
      const formData = buildProfileFormData(data);
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
      const hasChanges = Object.keys(personalProfileForm.formState.dirtyFields).length > 0;
      if (!hasChanges) {
        resetProfileFromSession(user, personalProfileForm);
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

  // Watch email/username fields and clear the confirm error when they match
  useMatchingFieldErrorClear({
    control: changeEmailForm.control,
    clearErrors: changeEmailForm.clearErrors,
    fieldName: 'email',
    confirmFieldName: 'confirmEmail',
  });
  useMatchingFieldErrorClear({
    control: changeUsernameForm.control,
    clearErrors: changeUsernameForm.clearErrors,
    fieldName: 'username',
    confirmFieldName: 'confirmUsername',
  });

  // Show toast notifications for profile form state changes
  useEffect(() => {
    if (
      formState.success &&
      !handledSuccessStatesRef.current.profile &&
      !isPending &&
      !isTransitionPending
    ) {
      handledSuccessStatesRef.current.profile = true;
      finalizeProfileSuccess(personalProfileForm, update);
    }

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
      setIsEditingUserEmail(false);
      finalizeEmailSuccess(changeEmailForm, update);
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
      setIsEditingUsername(false);
      finalizeUsernameSuccess(changeUsernameForm, update);
    }

    // Show error toasts once the submission has completed (captures all error types)
    if (usernameFormState.errors && !isUsernamePending && !isTransitionPending) {
      showUsernameErrorToasts(usernameFormState.errors);
    }
  }, [
    usernameFormState.success,
    usernameFormState.errors,
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
        const wasEditing = isEditingUserEmail;
        setIsEditingUserEmail((prev) => !prev);
        if (wasEditing) {
          changeEmailForm.clearErrors();
          changeEmailForm.setValue('confirmEmail', '');
        }
      } else {
        // The only other editable field is the username.
        const wasEditing = isEditingUsername;
        setIsEditingUsername((prev) => !prev);
        if (wasEditing) {
          changeUsernameForm.clearErrors();
          changeUsernameForm.setValue('confirmUsername', '');
        }
      }
    },
    [isEditingUserEmail, isEditingUsername, changeEmailForm, changeUsernameForm]
  );

  // Wait for session to load before rendering forms
  if (status === 'loading' || !user) {
    return <ProfileFormSkeleton />;
  }

  // Guard against forms not being initialized
  if (!personalProfileForm.control || !changeEmailForm.control || !changeUsernameForm.control) {
    return <ProfileFormSkeleton />;
  }

  return (
    <>
      <ProfilePersonalSection
        form={personalProfileForm}
        onSubmit={onSubmitPersonalProfileForm}
        isPending={isPending}
        isTransitionPending={isTransitionPending}
      />

      <Separator />

      <ProfileEmailSection
        form={changeEmailForm}
        onSubmit={onEditEmailSubmit}
        isEditing={isEditingUserEmail}
        isPending={isEmailPending}
        isTransitionPending={isTransitionPending}
        onEditToggle={handleEditFieldButtonClick}
      />

      <Separator />

      <ProfileUsernameSection
        form={changeUsernameForm}
        onSubmit={onSubmitEditUsername}
        isEditing={isEditingUsername}
        isPending={isUsernamePending}
        isTransitionPending={isTransitionPending}
        wasSuccessful={usernameFormState.success}
        onEditToggle={handleEditFieldButtonClick}
      />

      <Separator />

      <ConnectedAccountsSection />
    </>
  );
};
