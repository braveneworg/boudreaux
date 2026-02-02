/**
 * Custom render utilities for testing React components.
 *
 * Usage:
 * ```tsx
 * import { renderWithProviders, renderWithForm } from '@/test-utils/render-utils';
 *
 * // Render with all providers
 * const { getByText } = renderWithProviders(<MyComponent />);
 *
 * // Render a form field with react-hook-form
 * const { form, ...result } = renderWithForm(<TextField name="email" />);
 * ```
 */

import React from 'react';

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useForm,
  FormProvider,
  type UseFormReturn,
  type FieldValues,
  type DefaultValues,
  type SubmitHandler,
} from 'react-hook-form';

type UserEventSetup = ReturnType<typeof userEvent.setup>;

/**
 * Custom render result with userEvent instance
 */
interface CustomRenderResult extends RenderResult {
  user: UserEventSetup;
}

/**
 * Render with userEvent instance for user interactions
 *
 * This creates the userEvent instance once per test for better performance
 */
export const renderWithUser = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): CustomRenderResult => {
  const user = userEvent.setup();
  const result = render(ui, options);
  return { ...result, user };
};

/**
 * Wrapper component that provides common context providers
 */
const AllProviders = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

/**
 * Render with common providers
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): CustomRenderResult => {
  const user = userEvent.setup();
  const result = render(ui, { wrapper: AllProviders, ...options });
  return { ...result, user };
};

/**
 * Result type for renderWithForm
 */
interface FormRenderResult<T extends FieldValues> extends CustomRenderResult {
  form: UseFormReturn<T>;
}

/**
 * Creates a form wrapper component for testing
 */
function createFormCapture<T extends FieldValues>(
  capturedFormRef: { current: UseFormReturn<T> | null },
  defaultValues?: DefaultValues<T>,
  onSubmit?: SubmitHandler<T>
) {
  return function FormCapture({ children }: { children: React.ReactNode }) {
    const methods = useForm<T>({
      defaultValues,
    });
    // Store reference to form methods for test access during initial render
    if (!capturedFormRef.current) {
      capturedFormRef.current = methods;
    }
    return (
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit ?? (() => {}))}>{children}</form>
      </FormProvider>
    );
  };
}

/**
 * Render a component within a form context
 *
 * Useful for testing form fields that require react-hook-form context
 */
export function renderWithForm<T extends FieldValues = FieldValues>(
  ui: React.ReactElement,
  options?: {
    defaultValues?: DefaultValues<T>;
    onSubmit?: SubmitHandler<T>;
  } & Omit<RenderOptions, 'wrapper'>
): FormRenderResult<T> {
  const { defaultValues, onSubmit, ...renderOptions } = options ?? {};

  const capturedFormRef: { current: UseFormReturn<T> | null } = { current: null };
  const FormCapture = createFormCapture(capturedFormRef, defaultValues, onSubmit);

  const user = userEvent.setup();
  const result = render(ui, { wrapper: FormCapture, ...renderOptions });

  return {
    ...result,
    user,
    form: capturedFormRef.current!,
  };
}

/**
 * Wait for async state updates to complete
 *
 * Useful when testing components with useEffect or other async operations
 */
export const waitForStateUpdate = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Create a mock event for testing event handlers
 */
export const createMockEvent = <T extends HTMLElement>(
  overrides?: Partial<React.MouseEvent<T>>
): React.MouseEvent<T> =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: document.createElement('button') as unknown as T,
    target: document.createElement('button') as unknown as T,
    ...overrides,
  }) as unknown as React.MouseEvent<T>;

/**
 * Create a mock change event for form inputs
 */
export const createMockChangeEvent = (value: string): React.ChangeEvent<HTMLInputElement> =>
  ({
    target: { value },
    currentTarget: { value },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as React.ChangeEvent<HTMLInputElement>;

/**
 * Type-safe mock for async functions
 */
export function createAsyncMock<T>(resolvedValue: T) {
  return vi.fn().mockResolvedValue(resolvedValue);
}

/**
 * Type-safe mock for rejected async functions
 */
export function createRejectedMock(error: Error | string) {
  return vi.fn().mockRejectedValue(error instanceof Error ? error : new Error(error));
}
