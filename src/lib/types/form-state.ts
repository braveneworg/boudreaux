export type FormState = {
  errors?: Record<string, string[]>;
  fields: Record<string, boolean | string>;
  success: boolean;
  isSubmitted?: boolean;
  hasTimeout?: boolean;
  resolver?: 'zod' | 'yup' | 'custom';
  /** Optional data returned from successful form submission (e.g., created entity ID) */
  data?: Record<string, unknown>;
};
