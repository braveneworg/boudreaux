export type FormState = {
  errors?: Record<string, string[]>;
  fields: Record<string, boolean | string>;
  success: boolean;
  isSubmitted?: boolean;
  hasTimeout?: boolean;
  resolver?: 'zod' | 'yup' | 'custom';
};
