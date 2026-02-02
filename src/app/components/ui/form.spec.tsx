import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from './form';

// Test form schema
interface TestFormValues {
  email: string;
  password: string;
}

// Helper component to test useFormField hook
const TestFormFieldConsumer = () => {
  const field = useFormField();
  return (
    <div data-testid="field-consumer">
      <span data-testid="field-name">{field.name}</span>
      <span data-testid="field-id">{field.id}</span>
      <span data-testid="form-item-id">{field.formItemId}</span>
    </div>
  );
};

// Helper component that uses useFormField outside FormProvider
const InvalidFormFieldConsumer = () => {
  try {
    useFormField();
    return <div>Should not render</div>;
  } catch (error) {
    return <div data-testid="error">{(error as Error).message}</div>;
  }
};

// Test component for complete form structure
const CompleteFormField = ({
  name,
  showError = false,
}: {
  name: keyof TestFormValues;
  showError?: boolean;
}) => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });

  // Set error if showError is true
  if (showError) {
    form.setError(name, { type: 'manual', message: 'This field has an error' });
  }

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <input {...field} data-testid="input" />
            </FormControl>
            <FormDescription>Enter your email</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for testing FormLabel
const FormLabelTest = ({ className }: { className?: string }) => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={className}>Email</FormLabel>
            <FormControl>
              <input {...field} data-testid="input" />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for testing FormDescription
const FormDescriptionTest = ({ className }: { className?: string }) => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <input {...field} data-testid="input" />
            </FormControl>
            <FormDescription className={className}>Help text</FormDescription>
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for testing FormMessage with children
const FormMessageWithChildren = () => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <input {...field} data-testid="input" />
            </FormControl>
            <FormMessage>Default message</FormMessage>
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for integration test
const IntegrationForm = () => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <input type="email" {...field} data-testid="email" />
            </FormControl>
            <FormDescription>Enter your email address</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Password</FormLabel>
            <FormControl>
              <input type="password" {...field} data-testid="password" />
            </FormControl>
            <FormDescription>Must be at least 8 characters</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for testing FormField context
const FormFieldContextTest = () => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <TestFormFieldConsumer />
            <FormControl>
              <input {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component that provides form context
const TestFormWithField = () => {
  const form = useForm<TestFormValues>();
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <input {...field} data-testid="email-input" />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  );
};

// Component for FormItem test
const FormItemTest = ({ className }: { className?: string }) => {
  const form = useForm<TestFormValues>({
    defaultValues: { email: '', password: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem className={className} data-testid="form-item">
            <FormControl>
              <input {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  );
};

describe('Form Components', () => {
  describe('Form (FormProvider)', () => {
    it('provides form context to children', () => {
      render(<TestFormWithField />);
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
    });
  });

  describe('FormField', () => {
    it('renders Controller with field context', () => {
      render(<FormFieldContextTest />);
      expect(screen.getByTestId('field-name')).toHaveTextContent('email');
    });
  });

  describe('useFormField', () => {
    it('returns field information when used correctly', () => {
      render(<FormFieldContextTest />);

      expect(screen.getByTestId('field-name')).toHaveTextContent('email');
      expect(screen.getByTestId('field-id')).toBeInTheDocument();
      expect(screen.getByTestId('form-item-id')).toBeInTheDocument();
    });

    it('throws error when used outside FormProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<InvalidFormFieldConsumer />);

      expect(screen.getByTestId('error')).toHaveTextContent(
        'useFormField should be used within a FormProvider (Form)'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('FormItem', () => {
    it('renders with data-slot attribute', () => {
      render(<FormItemTest />);
      expect(screen.getByTestId('form-item')).toHaveAttribute('data-slot', 'form-item');
    });

    it('applies custom className', () => {
      render(<FormItemTest className="custom-class" />);
      expect(screen.getByTestId('form-item')).toHaveClass('custom-class');
    });

    it('provides id context to children', () => {
      render(<FormFieldContextTest />);
      const id = screen.getByTestId('field-id').textContent;
      expect(id).toBeTruthy();
    });
  });

  describe('FormLabel', () => {
    it('renders with data-slot attribute', () => {
      render(<CompleteFormField name="email" />);

      const label = document.querySelector('[data-slot="form-label"]');
      expect(label).toBeInTheDocument();
    });

    it('has htmlFor pointing to form item id', () => {
      render(<CompleteFormField name="email" />);

      const label = document.querySelector('[data-slot="form-label"]');
      const input = screen.getByTestId('input');

      expect(label).toHaveAttribute('for', input.id);
    });

    it('shows error state when field has error', () => {
      render(<CompleteFormField name="email" showError />);

      const label = document.querySelector('[data-slot="form-label"]');
      expect(label).toHaveAttribute('data-error', 'true');
    });

    it('applies custom className', () => {
      render(<FormLabelTest className="custom-label" />);

      const label = document.querySelector('[data-slot="form-label"]');
      expect(label).toHaveClass('custom-label');
    });
  });

  describe('FormControl', () => {
    it('renders with data-slot attribute', () => {
      render(<CompleteFormField name="email" />);

      const control = document.querySelector('[data-slot="form-control"]');
      expect(control).toBeInTheDocument();
    });

    it('sets aria-describedby to description id when no error', () => {
      render(<CompleteFormField name="email" />);

      const input = screen.getByTestId('input');
      expect(input.getAttribute('aria-describedby')).toContain('description');
    });

    it('sets aria-describedby to both description and message when error', () => {
      render(<CompleteFormField name="email" showError />);

      const input = screen.getByTestId('input');
      const describedBy = input.getAttribute('aria-describedby') || '';
      expect(describedBy).toContain('description');
      expect(describedBy).toContain('message');
    });

    it('sets aria-invalid when there is an error', () => {
      render(<CompleteFormField name="email" showError />);

      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('FormDescription', () => {
    it('renders with data-slot attribute', () => {
      render(<CompleteFormField name="email" />);

      const description = document.querySelector('[data-slot="form-description"]');
      expect(description).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<CompleteFormField name="email" />);

      expect(screen.getByText('Enter your email')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<FormDescriptionTest className="custom-description" />);

      const description = document.querySelector('[data-slot="form-description"]');
      expect(description).toHaveClass('custom-description');
    });
  });

  describe('FormMessage', () => {
    it('renders error message when field has error', () => {
      render(<CompleteFormField name="email" showError />);

      expect(screen.getByText('This field has an error')).toBeInTheDocument();
    });

    it('renders with data-slot attribute', () => {
      render(<CompleteFormField name="email" showError />);

      const message = document.querySelector('[data-slot="form-message"]');
      expect(message).toBeInTheDocument();
    });

    it('renders nothing when no error and no children', () => {
      render(<CompleteFormField name="email" />);

      const message = document.querySelector('[data-slot="form-message"]');
      expect(message).not.toBeInTheDocument();
    });

    it('renders children as fallback when no error', () => {
      render(<FormMessageWithChildren />);

      expect(screen.getByText('Default message')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<CompleteFormField name="email" showError />);

      const message = document.querySelector('[data-slot="form-message"]');
      expect(message).toHaveClass('text-destructive');
    });
  });

  describe('integration', () => {
    it('renders a complete form with all components', () => {
      render(<IntegrationForm />);

      expect(screen.getByTestId('email')).toBeInTheDocument();
      expect(screen.getByTestId('password')).toBeInTheDocument();
      expect(screen.getByText('Enter your email address')).toBeInTheDocument();
      expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
    });
  });
});
