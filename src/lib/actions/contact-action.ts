/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { headers } from 'next/headers';

import { SendEmailCommand } from '@aws-sdk/client-ses';

import { buildContactEmailHtml } from '@/lib/email/contact-email-html';
import { buildContactEmailText } from '@/lib/email/contact-email-text';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { rateLimit } from '@/lib/utils/rate-limit';
import { sesClient } from '@/lib/utils/ses-client';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import contactSchema, { CONTACT_REASONS } from '@/lib/validation/contact-schema';

import type { FormState } from '../types/form-state';

// Rate limiter: 3 contact submissions per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

export const contactAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  // Get IP address for rate limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'anonymous';

  // Check rate limit
  try {
    await limiter.check(3, ip);
  } catch {
    return {
      success: false,
      errors: { general: ['Too many submissions. Please try again later.'] },
      fields: {},
    };
  }

  // Verify Turnstile token
  const turnstileToken = payload.get('cf-turnstile-response') as string | null;
  if (!turnstileToken) {
    return {
      success: false,
      errors: { general: ['CAPTCHA verification required. Please complete the verification.'] },
      fields: {},
    };
  }

  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return {
      success: false,
      errors: {
        general: [turnstileResult.error || 'CAPTCHA verification failed. Please try again.'],
      },
      fields: {},
    };
  }

  const permittedFieldNames = ['reason', 'firstName', 'lastName', 'email', 'phone', 'message'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, contactSchema);

  if (!parsed.success) {
    // Map Zod validation errors to formState
    if (parsed.error) {
      for (const issue of parsed.error.issues) {
        const fieldName = issue.path[0]?.toString() || 'general';
        if (!formState.errors) {
          formState.errors = {};
        }
        if (!formState.errors[fieldName]) {
          formState.errors[fieldName] = [];
        }
        formState.errors[fieldName].push(issue.message);
      }
    }
    return formState;
  }

  // Build and send email
  try {
    const { reason, firstName, lastName, email, phone, message } = parsed.data;

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
      console.error('EMAIL_FROM or CONTACT_EMAIL environment variable is not set');
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
    console.error('Contact form email send error:', error);
    formState.success = false;
    setUnknownError(formState, 'Unable to send message. Please try again later.');
  }

  return formState;
};
