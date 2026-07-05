/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { after, NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { revalidateArtistBioPaths } from '@/lib/actions/generate-artist-bio-action-helpers';
import { BIO_CALLBACK_LIMIT, bioCallbackLimiter } from '@/lib/config/rate-limit-tiers';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { bioGenerationCallbackSchema } from '@/lib/validation/bio-generation-schema';

export const dynamic = 'force-dynamic';

// Room for up to ~100 re-hostable image rows plus the three bios.
const MAX_BODY_BYTES = 512 * 1024;

/**
 * POST /api/artists/[id]/bio-generation/callback
 * The out-of-band completion endpoint the bio-generator Lambda POSTs its result
 * to. Verifies the single-use job token, then runs the heavy persist + cache
 * revalidation post-response via `after()`. Always answers 202 — never revealing
 * whether the token matched — so the endpoint cannot be used to enumerate jobs.
 */
export const POST = withRateLimit<{ id: string }>(
  bioCallbackLimiter,
  BIO_CALLBACK_LIMIT
)(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = bioGenerationCallbackSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
  }

  const claim = await BioGenerationService.verifyAndClaimCallback(id, parsed.data.jobToken);
  if (claim) {
    // Heavy re-host/persist runs post-response; the admin form's poll surfaces completion.
    after(async () => {
      await BioGenerationService.completeCallback(id, parsed.data.result);
      revalidateArtistBioPaths(claim.slug);
    });
  }

  // Always 202 — never reveal whether the token matched (anti-enumeration).
  return new NextResponse(null, { status: 202 });
});
