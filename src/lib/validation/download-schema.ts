/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

export const DOWNLOAD_OPTIONS = [
  { value: 'free-320kbps', label: 'Free (320Kbps)' },
  {
    value: 'premium-digital',
    label: 'Premium digital formats: <br />FLAC, AAC, WAV, and more',
  },
] as const;

const downloadSchema = z.object({
  downloadOption: z
    .string({
      error: 'Please select a download option',
    })
    .refine((val) => DOWNLOAD_OPTIONS.some((option) => option.value === val), {
      message: 'Please select a download option',
    }),
  finalAmount: z
    .string()
    .optional()
    .refine(
      (val) => {
        const cleaned = val?.replace(/[^\d.]/g, '').trim();
        if (!cleaned) return true;
        const num = Number(cleaned);
        return Number.isFinite(num) && num >= 0;
      },
      { message: 'Final amount must be a non-negative number' }
    ),
});

export type DownloadFormSchemaType = z.infer<typeof downloadSchema>;

export default downloadSchema;
