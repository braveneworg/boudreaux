import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Name is required' })
    .max(200, { message: 'Name must be less than 200 characters' }),
  displayName: z
    .string()
    .max(200, { message: 'Display name must be less than 200 characters' })
    .optional()
    .or(z.literal('')),
  bio: z
    .string()
    .max(5000, { message: 'Bio must be less than 5000 characters' })
    .optional()
    .or(z.literal('')),
  shortBio: z
    .string()
    .max(500, { message: 'Short bio must be less than 500 characters' })
    .optional()
    .or(z.literal('')),
  formedOn: z.string().optional().or(z.literal('')),
  endedOn: z.string().optional().or(z.literal('')),
  publishedOn: z.string().optional().or(z.literal('')),
  // MongoDB ObjectId is a 24-character hex string, not a standard UUID
  createdBy: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, { message: 'Invalid MongoDB ObjectId format' })
    .optional(),
});

type schemaType = typeof createGroupSchema & Partial<FormData>;
export type GroupFormData = z.infer<schemaType>;
