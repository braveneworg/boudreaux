import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChangeFieldButtons from './change-field-buttons';

import type { UseFormReturn } from 'react-hook-form';

// Mock form data type
interface MockFormData {
  field: string;
}

// Create a mock form with proper typing
const createMockForm = (
  overrides: Partial<UseFormReturn<MockFormData>> = {}
): UseFormReturn<MockFormData> => {
  const defaultMock: UseFormReturn<MockFormData> = {
    formState: {
      errors: {},
      isDirty: false,
      isLoading: false,
      isSubmitted: false,
      isSubmitSuccessful: false,
      isSubmitting: false,
      isValidating: false,
      isValid: true,
      submitCount: 0,
      defaultValues: {},
      dirtyFields: {},
      touchedFields: {},
      validatingFields: {},
      disabled: false,
      isReady: true,
    },
    register: vi.fn(),
    handleSubmit: vi.fn(),
    watch: vi.fn(),
    getValues: vi.fn(),
    getFieldState: vi.fn(),
    setError: vi.fn(),
    clearErrors: vi.fn(),
    setValue: vi.fn(),
    trigger: vi.fn(),
    reset: vi.fn(),
    resetField: vi.fn(),
    setFocus: vi.fn(),
    unregister: vi.fn(),
    control: {} as UseFormReturn<MockFormData>['control'],
    ...overrides,
  } as UseFormReturn<MockFormData>;

  return defaultMock;
};

describe('ChangeFieldButtons', () => {
  const defaultProps = {
    id: 'test-field',
    isEditingField: false,
    handleEditFieldButtonClick: vi.fn(),
    changeFieldForm: createMockForm(),
    isPending: false,
    isTransitionPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render both Cancel/Change and Update buttons', () => {
      render(<ChangeFieldButtons {...defaultProps} />);

      expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('should render with correct button IDs', () => {
      render(<ChangeFieldButtons {...defaultProps} id="email" />);

      const changeButton = screen.getByRole('button', { name: /change/i });
      expect(changeButton).toHaveAttribute('id', 'email-change-button');
    });

    it('should render buttons in a flex container with justify-end', () => {
      const { container } = render(<ChangeFieldButtons {...defaultProps} />);

      const flexContainer = container.querySelector('.flex.justify-end');
      expect(flexContainer).toBeInTheDocument();
    });
  });

  describe('Change/Cancel Button Behavior', () => {
    it('should display "Change" when not editing', () => {
      render(<ChangeFieldButtons {...defaultProps} isEditingField={false} />);

      expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });

    it('should display "Cancel" when editing', () => {
      render(<ChangeFieldButtons {...defaultProps} isEditingField />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
    });

    it('should call handleEditFieldButtonClick when Change button is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <ChangeFieldButtons
          {...defaultProps}
          handleEditFieldButtonClick={handleClick}
          isEditingField={false}
        />
      );

      const changeButton = screen.getByRole('button', { name: /change/i });
      await user.click(changeButton);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should call handleEditFieldButtonClick when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <ChangeFieldButtons
          {...defaultProps}
          handleEditFieldButtonClick={handleClick}
          isEditingField
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should have mr-2 class for spacing between buttons', () => {
      render(<ChangeFieldButtons {...defaultProps} />);

      const changeButton = screen.getByRole('button', { name: /change/i });
      expect(changeButton).toHaveClass('mr-2');
    });

    it('should be type="button" for Change/Cancel button (not submit)', () => {
      render(<ChangeFieldButtons {...defaultProps} />);

      const changeButton = screen.getByRole('button', { name: /change/i });
      expect(changeButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Update Button Behavior', () => {
    it('should display "Update" when not pending', () => {
      render(
        <ChangeFieldButtons {...defaultProps} isPending={false} isTransitionPending={false} />
      );

      expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument();
    });

    it('should display "Updating..." when isPending is true', () => {
      render(<ChangeFieldButtons {...defaultProps} isPending />);

      expect(screen.getByRole('button', { name: /updating\.\.\./i })).toBeInTheDocument();
    });

    it('should display "Updating..." when isTransitionPending is true', () => {
      render(<ChangeFieldButtons {...defaultProps} isTransitionPending />);

      expect(screen.getByRole('button', { name: /updating\.\.\./i })).toBeInTheDocument();
    });

    it('should display "Updating..." when both pending states are true', () => {
      render(<ChangeFieldButtons {...defaultProps} isPending isTransitionPending />);

      expect(screen.getByRole('button', { name: /updating\.\.\./i })).toBeInTheDocument();
    });

    it('should have type="submit" for Update button', () => {
      render(<ChangeFieldButtons {...defaultProps} />);

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toHaveAttribute('type', 'submit');
    });
  });

  describe('Update Button Disabled States', () => {
    it('should be disabled when form has errors', () => {
      const formWithErrors = createMockForm({
        formState: {
          errors: { field: { type: 'required', message: 'Required' } },
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: false,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={formWithErrors} isEditingField />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toBeDisabled();
    });

    it('should be disabled when isPending is true', () => {
      const cleanForm = createMockForm({
        formState: {
          errors: {},
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons
          {...defaultProps}
          changeFieldForm={cleanForm}
          isPending
          isEditingField
        />
      );

      const updateButton = screen.getByRole('button', { name: /updating\.\.\./i });
      expect(updateButton).toBeDisabled();
    });

    it('should be disabled when isTransitionPending is true', () => {
      const cleanForm = createMockForm({
        formState: {
          errors: {},
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons
          {...defaultProps}
          changeFieldForm={cleanForm}
          isTransitionPending
          isEditingField
        />
      );

      const updateButton = screen.getByRole('button', { name: /updating\.\.\./i });
      expect(updateButton).toBeDisabled();
    });

    it('should be disabled when not editing', () => {
      const cleanForm = createMockForm({
        formState: {
          errors: {},
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={cleanForm} isEditingField={false} />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toBeDisabled();
    });

    it('should be disabled when form is not dirty', () => {
      const pristineForm = createMockForm({
        formState: {
          errors: {},
          isDirty: false,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={pristineForm} isEditingField />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toBeDisabled();
    });

    it('should be enabled when all conditions are met (no errors, editing, dirty, not pending)', () => {
      const validForm = createMockForm({
        formState: {
          errors: {},
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons
          {...defaultProps}
          changeFieldForm={validForm}
          isPending={false}
          isTransitionPending={false}
          isEditingField
        />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).not.toBeDisabled();
    });
  });

  describe('Combined Disabled Conditions', () => {
    it('should be disabled when multiple conditions are not met (errors + not editing)', () => {
      const formWithErrors = createMockForm({
        formState: {
          errors: { field: { type: 'required', message: 'Required' } },
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: false,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons
          {...defaultProps}
          changeFieldForm={formWithErrors}
          isEditingField={false}
        />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toBeDisabled();
    });

    it('should be disabled when all conditions fail', () => {
      const invalidForm = createMockForm({
        formState: {
          errors: { field: { type: 'required', message: 'Required' } },
          isDirty: false,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: false,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons
          {...defaultProps}
          changeFieldForm={invalidForm}
          isPending
          isTransitionPending
          isEditingField={false}
        />
      );

      const updateButton = screen.getByRole('button', { name: /updating\.\.\./i });
      expect(updateButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error object correctly', () => {
      const formWithNoErrors = createMockForm({
        formState: {
          errors: {},
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: true,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={formWithNoErrors} isEditingField />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).not.toBeDisabled();
    });

    it('should handle form errors correctly', () => {
      const formWithError = createMockForm({
        formState: {
          errors: {
            field: { type: 'required', message: 'Required' },
          },
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: false,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={formWithError} isEditingField />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toBeDisabled();
    });

    it('should render correctly with different ID values', () => {
      const { rerender } = render(<ChangeFieldButtons {...defaultProps} id="email" />);

      let changeButton = screen.getByRole('button', { name: /change/i });
      expect(changeButton).toHaveAttribute('id', 'email-change-button');

      rerender(<ChangeFieldButtons {...defaultProps} id="username" />);

      changeButton = screen.getByRole('button', { name: /change/i });
      expect(changeButton).toHaveAttribute('id', 'username-change-button');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      render(<ChangeFieldButtons {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('should have descriptive button text for screen readers', () => {
      render(<ChangeFieldButtons {...defaultProps} isEditingField={false} />);

      expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('should communicate disabled state to screen readers', () => {
      const formWithErrors = createMockForm({
        formState: {
          errors: { field: { type: 'required', message: 'Required' } },
          isDirty: true,
          isLoading: false,
          isSubmitted: false,
          isSubmitSuccessful: false,
          isSubmitting: false,
          isValidating: false,
          isValid: false,
          submitCount: 0,
          defaultValues: {},
          dirtyFields: {},
          touchedFields: {},
          validatingFields: {},
          disabled: false,
          isReady: true,
        },
      });

      render(
        <ChangeFieldButtons {...defaultProps} changeFieldForm={formWithErrors} isEditingField />
      );

      const updateButton = screen.getByRole('button', { name: /update/i });
      expect(updateButton).toHaveAttribute('disabled');
    });

    it('should communicate loading state through button text', () => {
      render(<ChangeFieldButtons {...defaultProps} isPending isEditingField />);

      expect(screen.getByRole('button', { name: /updating\.\.\./i })).toBeInTheDocument();
    });
  });

  describe('Type Safety', () => {
    it('should work with any generic FieldValues type', () => {
      interface CustomFormData {
        customField: string;
        anotherField: number;
      }

      const customForm = createMockForm() as unknown as UseFormReturn<CustomFormData>;

      render(
        <ChangeFieldButtons
          id="custom"
          isEditingField={false}
          handleEditFieldButtonClick={vi.fn()}
          changeFieldForm={customForm}
          isPending={false}
          isTransitionPending={false}
        />
      );

      expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
    });
  });
});
