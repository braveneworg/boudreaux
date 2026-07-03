/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProfileForm } from './profile-form';

const useSessionMock = vi.hoisted(() => vi.fn());
const updateProfileActionMock = vi.hoisted(() => vi.fn());
const changeEmailActionMock = vi.hoisted(() => vi.fn());
const changeUsernameActionMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

// Deterministic react-hook-form doubles. Each useForm() call is routed to a
// stable singleton via the resolver tag so effect dependencies stay referentially
// stable across renders (avoiding infinite effect loops).
type FormMock = {
  control: Record<string, unknown> | null;
  register: ReturnType<typeof vi.fn>;
  handleSubmit: (
    cb: (data: Record<string, unknown>) => void
  ) => (e?: { preventDefault?: () => void }) => void;
  reset: ReturnType<typeof vi.fn>;
  setValue: ReturnType<typeof vi.fn>;
  clearErrors: ReturnType<typeof vi.fn>;
  getValues: ReturnType<typeof vi.fn>;
  formState: { isDirty: boolean; dirtyFields: Record<string, boolean> };
  _values: Record<string, unknown>;
};

const forms = vi.hoisted(() => ({
  current: {} as Record<string, FormMock>,
}));
const watched = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('react-hook-form', () => ({
  useForm: (opts: { resolver: { __tag: string } }) => forms.current[opts.resolver.__tag],
  useWatch: ({ name }: { name: string }) =>
    Object.entries(watched.values).find(([key]) => key === name)?.[1],
  Controller: ({
    render,
  }: {
    render: (props: {
      field: { value: boolean; onChange: () => void; name: string };
    }) => React.ReactNode;
  }) => render({ field: { value: false, onChange: vi.fn(), name: 'allowSmsNotifications' } }),
}));

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: (schema: string) => ({ __tag: schema }),
}));

vi.mock('@/lib/validation/profile-schema', () => ({ profileSchema: 'profile' }));
vi.mock('@/lib/validation/change-email-schema', () => ({ changeEmailSchema: 'email' }));
vi.mock('@/lib/validation/change-username-schema', () => ({ changeUsernameSchema: 'username' }));

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => useSessionMock(),
}));

vi.mock('@/lib/actions/update-profile-action', () => ({
  updateProfileAction: (state: unknown, fd: FormData) => updateProfileActionMock(state, fd),
}));
vi.mock('@/lib/actions/change-email-action', () => ({
  changeEmailAction: (state: unknown, fd: FormData) => changeEmailActionMock(state, fd),
}));
vi.mock('@/lib/actions/change-username-action', () => ({
  changeUsernameAction: (state: unknown, fd: FormData) => changeUsernameActionMock(state, fd),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

vi.mock('@/app/components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({ name, label, disabled }: { name: string; label: string; disabled?: boolean }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input id={name} disabled={disabled} />
    </div>
  ),
  StateField: () => <div data-testid="state-field" />,
  CountryField: () => <div data-testid="country-field" />,
}));

vi.mock('@/app/components/auth/generate-username-button', () => ({
  GenerateUsernameButton: () => <button type="button">Generate username</button>,
}));

vi.mock('@/ui/switch', () => ({
  Switch: (props: { id: string }) => <button type="button" id={props.id} aria-pressed={false} />,
}));

vi.mock('@/app/hooks/use-connected-accounts', () => ({
  useConnectedAccounts: () => ({ accounts: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    linkSocial: vi.fn(),
    unlinkAccount: vi.fn(),
  },
}));

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  username: 'johndoe',
  phone: '',
  name: 'John Doe',
  ...overrides,
});

const makeForm = (values: Record<string, unknown>): FormMock => {
  const form: FormMock = {
    control: {},
    register: vi.fn((name: string) => ({ name })),
    handleSubmit: (cb) => (e) => {
      e?.preventDefault?.();
      cb(form._values);
    },
    reset: vi.fn(),
    setValue: vi.fn(),
    clearErrors: vi.fn(),
    getValues: vi.fn((name?: string) =>
      name ? new Map(Object.entries(form._values)).get(name) : form._values
    ),
    formState: { isDirty: true, dirtyFields: {} },
    _values: values,
  };
  return form;
};

const resetForms = () => {
  forms.current = {
    profile: makeForm({
      firstName: 'John',
      lastName: 'Doe',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      allowSmsNotifications: false,
      allowEmailNotifications: false,
    }),
    email: makeForm({
      email: 'new@example.com',
      confirmEmail: 'new@example.com',
      previousEmail: 'john@example.com',
    }),
    username: makeForm({ username: 'newname', confirmUsername: 'newname' }),
  };
};

describe('ProfileForm', () => {
  beforeEach(() => {
    resetForms();
    watched.values = {};
    useSessionMock.mockReturnValue({
      data: { user: buildUser() },
      update: vi.fn(),
      status: 'authenticated',
    });
    updateProfileActionMock.mockResolvedValue({ success: false, fields: {} });
    changeEmailActionMock.mockResolvedValue({ success: false, fields: {} });
    changeUsernameActionMock.mockResolvedValue({ success: false, fields: {} });
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  describe('loading and guard states', () => {
    it('renders skeletons while the session is loading', () => {
      useSessionMock.mockReturnValue({ data: null, update: vi.fn(), status: 'loading' });

      const { container } = render(<ProfileForm />);

      expect(
        container.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length
      ).toBeGreaterThan(0);
      expect(screen.queryByText('Personal Information')).not.toBeInTheDocument();
    });

    it('renders skeletons when authenticated but the user is missing', () => {
      useSessionMock.mockReturnValue({ data: {}, update: vi.fn(), status: 'authenticated' });

      render(<ProfileForm />);

      expect(screen.queryByText('Personal Information')).not.toBeInTheDocument();
    });

    it('renders skeletons when a form control is not yet initialized', () => {
      forms.current.profile.control = null;

      render(<ProfileForm />);

      expect(screen.queryByText('Personal Information')).not.toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders the profile heading image and section titles', () => {
      render(<ProfileForm />);

      const headingImage = screen.getByRole('img', { name: /profile/i });
      expect(headingImage).toHaveAttribute('src', '/media/headings/PROFILE.webp');
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.getByText('Update your username')).toBeInTheDocument();
    });

    it('shows the Edit Email and Edit Username buttons by default', () => {
      render(<ProfileForm />);

      expect(screen.getByRole('button', { name: 'Edit Email' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Username' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Email' })).not.toBeInTheDocument();
    });

    it('renders the four profile sections as kraft zine panels', () => {
      const { container } = render(<ProfileForm />);

      const panels = container.querySelectorAll('[data-slot="zine-panel"]');
      expect(panels).toHaveLength(4);
      panels.forEach((panel) => expect(panel).toHaveClass('zine-accent-kraft'));
    });

    it('spaces the three section forms with space-y-6', () => {
      const { container } = render(<ProfileForm />);

      expect(container.querySelectorAll('form.space-y-6')).toHaveLength(3);
    });

    it('lays out the personal name grid two-up from sm with no md override', () => {
      const { container } = render(<ProfileForm />);

      const nameGrid = screen.getByLabelText('First Name').closest('.grid');
      expect(nameGrid).toHaveClass('sm:grid-cols-2');
      expect(container.querySelector('.md\\:grid-cols-2')).toBeNull();
    });
  });

  describe('form population effect', () => {
    it('resets the personal form from the session user when not dirty', () => {
      render(<ProfileForm />);

      expect(forms.current.profile.reset).toHaveBeenCalled();
    });

    it('falls back to the split full name when first/last names are missing', () => {
      useSessionMock.mockReturnValue({
        data: { user: buildUser({ firstName: '', lastName: '', name: 'Jane Smith' }) },
        update: vi.fn(),
        status: 'authenticated',
      });

      render(<ProfileForm />);

      const resetArg = forms.current.profile.reset.mock.calls[0][0] as Record<string, string>;
      expect(resetArg.firstName).toBe('Jane');
      expect(resetArg.lastName).toBe('Smith');
    });

    it('does not reset the personal form when it already has dirty fields', () => {
      forms.current.profile.formState.dirtyFields = { firstName: true };

      render(<ProfileForm />);

      expect(forms.current.profile.reset).not.toHaveBeenCalled();
    });

    it('seeds the email and username forms from the session user', () => {
      render(<ProfileForm />);

      expect(forms.current.email.setValue).toHaveBeenCalledWith('email', 'john@example.com');
      expect(forms.current.email.setValue).toHaveBeenCalledWith(
        'previousEmail',
        'john@example.com'
      );
      expect(forms.current.username.setValue).toHaveBeenCalledWith('username', 'johndoe');
    });
  });

  describe('matching-field watchers', () => {
    it('clears the confirm-email error when email and confirmation match', () => {
      watched.values = { email: 'a@b.com', confirmEmail: 'a@b.com' };

      render(<ProfileForm />);

      expect(forms.current.email.clearErrors).toHaveBeenCalledWith('confirmEmail');
    });

    it('does not clear the confirm-email error when the values differ', () => {
      watched.values = { email: 'a@b.com', confirmEmail: 'different@b.com' };

      render(<ProfileForm />);

      expect(forms.current.email.clearErrors).not.toHaveBeenCalled();
    });

    it('clears the confirm-username error when username and confirmation match', () => {
      watched.values = { username: 'sameuser', confirmUsername: 'sameuser' };

      render(<ProfileForm />);

      expect(forms.current.username.clearErrors).toHaveBeenCalledWith('confirmUsername');
    });
  });

  describe('personal profile submission', () => {
    it('submits the profile and shows a success toast', async () => {
      const update = vi.fn();
      useSessionMock.mockReturnValue({
        data: { user: buildUser() },
        update,
        status: 'authenticated',
      });
      updateProfileActionMock.mockResolvedValue({ success: true, fields: {} });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith(
          'Your profile has been updated successfully.'
        );
      });
      const fd = updateProfileActionMock.mock.calls[0][1] as FormData;
      expect(fd.get('firstName')).toBe('John');
      expect(fd.get('allowSmsNotifications')).toBe('false');
      expect(fd.get('allowEmailNotifications')).toBe('false');
      expect(update).toHaveBeenCalled();
    });

    it('shows an error toast when the profile action returns a general error', async () => {
      updateProfileActionMock.mockResolvedValue({
        success: false,
        errors: { general: ['Something went wrong'] },
        fields: {},
      });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Something went wrong');
      });
    });

    it('disables the save button and shows "Saving..." while the action is pending', async () => {
      let resolveAction: (value: unknown) => void = () => {};
      updateProfileActionMock.mockReturnValue(
        new Promise((resolve) => {
          resolveAction = resolve;
        })
      );

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
      resolveAction({ success: false, fields: {} });
    });
  });

  describe('email editing and submission', () => {
    it('toggles into edit mode then cancels, clearing errors', async () => {
      render(<ProfileForm />);

      await userEvent.click(screen.getByRole('button', { name: 'Edit Email' }));
      expect(screen.getByRole('button', { name: 'Save Email' })).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Email')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(forms.current.email.clearErrors).toHaveBeenCalledWith();
      expect(forms.current.email.setValue).toHaveBeenCalledWith('confirmEmail', '');
    });

    it('submits the email change and shows a success toast', async () => {
      const update = vi.fn();
      useSessionMock.mockReturnValue({
        data: { user: buildUser() },
        update,
        status: 'authenticated',
      });
      changeEmailActionMock.mockResolvedValue({ success: true, fields: {} });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Email' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Email' }));

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith('Your email has been updated successfully.');
      });
      const fd = changeEmailActionMock.mock.calls[0][1] as FormData;
      expect(fd.get('email')).toBe('new@example.com');
      expect(fd.get('previousEmail')).toBe('john@example.com');
      // Save Email also carries the email opt-in selection.
      expect(fd.get('allowEmailNotifications')).toBe('false');
    });
  });

  describe('username editing and submission', () => {
    it('submits the username change and shows a success toast', async () => {
      changeUsernameActionMock.mockResolvedValue({ success: true, fields: {} });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Username' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Username' }));

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith(
          'Your username has been updated successfully.'
        );
      });
      const fd = changeUsernameActionMock.mock.calls[0][1] as FormData;
      expect(fd.get('username')).toBe('newname');
      expect(fd.get('confirmUsername')).toBe('newname');
    });

    it('shows toasts for general and field-specific username errors', async () => {
      changeUsernameActionMock.mockResolvedValue({
        success: false,
        errors: { general: ['Username taken'], username: ['Too short', 'No spaces'] },
        fields: {},
      });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Username' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Username' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Username taken', {
          id: 'username-error-Username taken',
        });
      });
      expect(toastMock.error).toHaveBeenCalledWith('Too short', {
        id: 'username-field-error-Too short',
      });
      expect(toastMock.error).toHaveBeenCalledWith('No spaces', {
        id: 'username-field-error-No spaces',
      });
    });

    it('cancels username editing and clears the confirmation', async () => {
      render(<ProfileForm />);

      await userEvent.click(screen.getByRole('button', { name: 'Edit Username' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(forms.current.username.clearErrors).toHaveBeenCalledWith();
      expect(forms.current.username.setValue).toHaveBeenCalledWith('confirmUsername', '');
    });

    it('shows only a general toast when there are no field errors', async () => {
      changeUsernameActionMock.mockResolvedValue({
        success: false,
        errors: { general: ['Only general'] },
        fields: {},
      });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Username' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Username' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Only general', {
          id: 'username-error-Only general',
        });
      });
    });

    it('shows only field toasts when there is no general error', async () => {
      changeUsernameActionMock.mockResolvedValue({
        success: false,
        errors: { username: ['Field only'] },
        fields: {},
      });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Username' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Username' }));

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('Field only', {
          id: 'username-field-error-Field only',
        });
      });
    });
  });

  describe('empty and nullish value handling', () => {
    it('coerces empty personal-form fields to empty strings in FormData', async () => {
      forms.current.profile._values = {
        firstName: '',
        lastName: '',
        phone: undefined,
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        allowSmsNotifications: false,
      };
      updateProfileActionMock.mockResolvedValue({ success: false, fields: {} });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(updateProfileActionMock).toHaveBeenCalledTimes(1);
      });
      const fd = updateProfileActionMock.mock.calls[0][1] as FormData;
      expect(fd.get('firstName')).toBe('');
      expect(fd.get('lastName')).toBe('');
      expect(fd.get('phone')).toBe('');
    });

    it('defaults a missing previousEmail to an empty string in FormData', async () => {
      forms.current.email._values = {
        email: 'new@example.com',
        confirmEmail: 'new@example.com',
        previousEmail: undefined,
      };
      changeEmailActionMock.mockResolvedValue({ success: false, fields: {} });

      render(<ProfileForm />);
      await userEvent.click(screen.getByRole('button', { name: 'Edit Email' }));
      await userEvent.click(screen.getByRole('button', { name: 'Save Email' }));

      await waitFor(() => {
        expect(changeEmailActionMock).toHaveBeenCalledTimes(1);
      });
      const fd = changeEmailActionMock.mock.calls[0][1] as FormData;
      expect(fd.get('previousEmail')).toBe('');
    });

    it('falls back to empty names when the user has no name at all', () => {
      useSessionMock.mockReturnValue({
        data: {
          user: buildUser({ firstName: '', lastName: '', name: undefined, phone: undefined }),
        },
        update: vi.fn(),
        status: 'authenticated',
      });

      render(<ProfileForm />);

      const resetArg = forms.current.profile.reset.mock.calls[0][0] as Record<string, string>;
      expect(resetArg.firstName).toBe('');
      expect(resetArg.lastName).toBe('');
      expect(resetArg.phone).toBe('');
    });
  });
});
