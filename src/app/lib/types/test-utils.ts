import type { UseFormReturn, FieldValues } from 'react-hook-form';
import type { Mock } from 'vitest';

/**
 * Type for React Hook Form's setValue options
 */
export interface SetValueOptions {
  shouldValidate?: boolean;
  shouldDirty?: boolean;
  shouldTouch?: boolean;
}

/**
 * Utility type for creating partial mocks of UseFormReturn
 * Uses a mapped type with explicit unknown values for better type safety
 * while still allowing flexible mocking in tests
 */
export type MockedFormReturn<TFieldValues extends FieldValues = FieldValues> = {
  [K in keyof UseFormReturn<TFieldValues>]?: unknown;
} & {
  setValue?: Mock;
  getValues?: Mock;
  trigger?: Mock<[], Promise<boolean>>;
  watch?: Mock;
  reset?: Mock;
  handleSubmit?: Mock;
  formState?: Partial<UseFormReturn<TFieldValues>['formState']>;
};

/**
 * Creates a partial mock of UseFormReturn with proper typing
 * Uses type assertion to satisfy component requirements while maintaining
 * compile-time safety through the MockedFormReturn constraint
 *
 * @example
 * ```typescript
 * const mockForm = createMockedForm<{ username: string }>({
 *   setValue: vi.fn(),
 *   getValues: vi.fn(() => ({ username: 'test' })),
 * });
 * ```
 */
export function createMockedForm<TFieldValues extends FieldValues = FieldValues>(
  overrides: MockedFormReturn<TFieldValues>
): UseFormReturn<TFieldValues> {
  // Type assertion is necessary here because we're converting a partial mock
  // to a full UseFormReturn type. This is safe in test contexts where we only
  // interact with the mocked properties.
  return overrides as unknown as UseFormReturn<TFieldValues>;
}

/**
 * Type helper for mocking global objects with proper typing
 * @example
 * ```typescript
 * const mockWindow: MockGlobal<Window> = {
 *   location: { hostname: 'localhost', port: '3000' }
 * };
 * ```
 */
export type MockGlobal<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};

/**
 * Prisma mock helper type for database operations
 */
export type MockPrismaClient<T extends Record<string, unknown>> = {
  [K in keyof T]: Mock;
};
