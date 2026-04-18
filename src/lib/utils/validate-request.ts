/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';

import type { ZodType } from 'zod';

interface ValidationSuccess<T> {
  success: true;
  data: T;
}

interface ValidationFailure {
  success: false;
  response: NextResponse;
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates a request body against a Zod schema.
 * Returns validated data on success, or a 400 NextResponse with error details on failure.
 */
export function validateBody<T>(schema: ZodType<T>, body: unknown): ValidationResult<T> {
  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          // Hide the full Zod issue tree in production to avoid leaking schema
          // shape to attackers. Callers that need user-facing field messages
          // should build their own response from a whitelisted view.
          details: process.env.NODE_ENV !== 'production' ? result.error.issues : undefined,
        },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: result.data };
}
