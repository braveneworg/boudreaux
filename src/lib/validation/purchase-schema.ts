/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** Validates the input to createPurchaseCheckoutSessionAction. */
export const purchaseCheckoutSchema = z.object({
  releaseId: z.string().min(1, 'Release ID is required'),
  releaseTitle: z.string().min(1, 'Release title is required'),
  amountCents: z
    .number()
    .int('Amount must be a whole number of cents')
    .min(50, 'Minimum amount is $0.50'),
  customerEmail: z.string().email('A valid customer email is required'),
});

export type PurchaseCheckoutSchemaType = z.infer<typeof purchaseCheckoutSchema>;

/** Validates the raw dollar-amount string input from the PWYW field. */
export const amountInputSchema = z.object({
  amount: z.string().regex(/^\$?\d+(\.\d{1,2})?$/, 'Enter a valid dollar amount (e.g. 5.00)'),
});

export type AmountInputSchemaType = z.infer<typeof amountInputSchema>;
