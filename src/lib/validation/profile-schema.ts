/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { COUNTRIES } from '../utils/countries';
import { US_STATES } from '../utils/states';

const profileSchema = z.object({
  firstName: z
    .string()
    .max(50, { message: 'First name must be less than 50 characters' })
    .optional()
    .or(z.literal('')),
  lastName: z
    .string()
    .max(50, { message: 'Last name must be less than 50 characters' })
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .regex(/^(\+1|1)?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/, {
      message: 'Please enter a valid phone number',
    })
    .optional()
    .or(z.literal('')),
  addressLine1: z
    .string()
    .max(100, { message: 'Address must be less than 100 characters' })
    .optional()
    .or(z.literal('')),
  addressLine2: z
    .string()
    .max(100, { message: 'Address line 2 must be less than 100 characters' })
    .optional()
    .or(z.literal('')),
  city: z
    .string()
    .max(50, { message: 'City must be less than 50 characters' })
    .optional()
    .or(z.literal('')),
  state: z
    .string()
    .refine((value) => value === '' || US_STATES.some((state) => state.code === value), {
      message: 'Please select a valid US state',
    })
    .optional()
    .or(z.literal('')),
  zipCode: z
    .string()
    .regex(/^[0-9]{5}(-[0-9]{4})?$|^[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]$/, {
      message: 'Please enter a valid ZIP code (12345 or 12345-6789) or postal code (A1A 1A1)',
    })
    .optional()
    .or(z.literal('')),
  country: z
    .string()
    .min(1, { message: 'Country is required' })
    .refine((value) => COUNTRIES.some((country) => country.code === value), {
      message: 'Please select a valid country',
    })
    .optional()
    .or(z.literal('')),
  allowSmsNotifications: z.boolean().optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

export default profileSchema;
