import * as z from 'zod';

const username = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Invalid username. You can only use letters, numbers, underscores, and dashes.',
  });
const changeUsernameSchema = z
  .object({
    username,
    confirmUsername: z.string(),
  })
  .refine((data) => data.username === data.confirmUsername, {
    message: 'Usernames do not match',
    path: ['confirmUsername'],
  });

export default changeUsernameSchema;

export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
