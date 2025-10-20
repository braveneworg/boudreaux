import type changeEmailSchema from '@/app/lib/validation/change-email-schema';
import type changeUsernameSchema from '@/app/lib/validation/change-username-schema';
import type profileSchema from '@/app/lib/validation/profile-schema';

import type { z } from 'zod';

export type ProfileFormData = z.infer<typeof profileSchema>;
export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
