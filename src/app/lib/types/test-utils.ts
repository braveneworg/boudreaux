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
 * Allows mocking only the methods you need while maintaining type safety
 */
export type MockedFormReturn<TFieldValues extends FieldValues = FieldValues> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof UseFormReturn<TFieldValues>]?: any;
} & {
  setValue?: Mock;
  getValues?: Mock;
  trigger?: Mock<[], Promise<boolean>>;
};

/**
 * Creates a partial mock of UseFormReturn with proper typing
 * Returns the mock as UseFormReturn to satisfy component type requirements
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return overrides as any as UseFormReturn<TFieldValues>;
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
