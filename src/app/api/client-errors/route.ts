/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { CLIENT_ERROR_LIMIT, clientErrorLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { extractRequestMetadata } from '@/lib/utils/audit-log';
import { createLogger } from '@/lib/utils/logger';
import { clientErrorReportSchema } from '@/lib/validation/client-error-schema';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2048;

const logger = createLogger('CLIENT_ERROR');

/**
 * POST /api/client-errors
 * Receives error-boundary reports from the browser and writes them to the
 * structured server log. Strictly rate-limited and size-capped.
 */
export const POST = withRateLimit(
  clientErrorLimiter,
  CLIENT_ERROR_LIMIT
)(async (request: NextRequest) => {
  try {
    const rawBody = await request.text();

    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const parsed = clientErrorReportSchema.safeParse(JSON.parse(rawBody));

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid error report' }, { status: 400 });
    }

    const { ip, userAgent } = extractRequestMetadata(request);
    logger.warn('Client-side error reported', { ...parsed.data, ip, userAgent });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Malformed JSON or unreadable body — a client problem, not a server error
    return NextResponse.json({ error: 'Invalid error report' }, { status: 400 });
  }
});
