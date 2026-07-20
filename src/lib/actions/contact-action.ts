/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { buildContactEmailHtml } from '@/lib/email/contact-email-html';
import { buildContactEmailText } from '@/lib/email/contact-email-text';
import type { FormState } from '@/lib/types/form-state';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { loggers } from '@/lib/utils/logger';
import { checkPublicFormGuards } from '@/lib/utils/public-form-guards';
import { rateLimit } from '@/lib/utils/rate-limit';
import { sesClient } from '@/lib/utils/ses-client';
import {
  contactSchema,
  CONTACT_REASONS,
  type ContactFormSchemaType,
} from '@/lib/validation/contact-schema';

// Rate limiter: 3 contact submissions per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/**
 * Build the SES message from validated contact data and send it, recording the
 * outcome on `formState`. Mirrors the original inline flow: a missing
 * EMAIL_FROM/CONTACT_EMAIL config or a send failure surfaces a generic error
 * via {@link setUnknownError} rather than leaking details to the submitter.
 */
const dispatchContactEmail = async (
  data: ContactFormSchemaType,
  formState: FormState
): Promise<FormState> => {
  try {
    const { reason, firstName, lastName, email, phone, message } = data;

    const reasonLabel = CONTACT_REASONS.find((r) => r.value === reason)?.label || reason;
    const timestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/New_York',
    });

    const emailData = {
      reason: reasonLabel,
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      message,
      timestamp,
    };

    const fromAddress = process.env.EMAIL_FROM;
    const toAddress = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;

    if (!fromAddress || !toAddress) {
      loggers.auth.error('EMAIL_FROM or CONTACT_EMAIL environment variable is not set');
      setUnknownError(formState, 'Unable to send message. Please try again later.');
      return formState;
    }

    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: {
        ToAddresses: [toAddress],
      },
      ReplyToAddresses: [email],
      Message: {
        Subject: {
          Data: `Contact Form: ${reasonLabel} — ${firstName} ${lastName}`,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: buildContactEmailHtml(emailData),
            Charset: 'UTF-8',
          },
          Text: {
            Data: buildContactEmailText(emailData),
            Charset: 'UTF-8',
          },
        },
      },
    });

    await sesClient.send(command);
    formState.success = true;
  } catch (error: unknown) {
    loggers.auth.error('Contact form email send error', error);
    formState.success = false;
    setUnknownError(formState, 'Unable to send message. Please try again later.');
  }

  return formState;
};

export const contactAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const guardError = await checkPublicFormGuards({
    payload,
    limiter,
    maxRequests: 3,
    rateLimitMessage: 'Too many submissions. Please try again later.',
  });
  if (guardError) return guardError;

  const permittedFieldNames = [
    'reason',
    'firstName',
    'lastName',
    'email',
    'phone',
    'message',
  ] as const;
  const { formState, parsed } = getActionState(payload, permittedFieldNames, contactSchema);

  if (!parsed.success) {
    // Map Zod validation errors to formState (no-op when there is no error object).
    if (parsed.error) {
      applyZodIssuesToFormState(formState, parsed.error);
    }
    return formState;
  }

  return dispatchContactEmail(parsed.data, formState);
};
