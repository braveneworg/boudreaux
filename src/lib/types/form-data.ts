import type changeEmailSchema from '@/lib/validation/change-email-schema';
import type changeUsernameSchema from '@/lib/validation/change-username-schema';
import type profileSchema from '@/lib/validation/profile-schema';

import type { z } from 'zod';

export type ProfileFormData = z.infer<typeof profileSchema>;
export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
