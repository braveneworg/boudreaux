/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { BioGenerationService } from '@/lib/services/bio-generation-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artists/[id]/bio-generation
 * Admin-only. Returns the async bio-generation status for an artist, plus the
 * persisted bio content once the job has succeeded (so the admin form can
 * populate without a second request). The client polls this while a job runs.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const status = await BioGenerationService.getGenerationStatus(id);
      if (!status) {
        return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
      }

      return NextResponse.json(status);
    } catch (error) {
      loggers.media.error('Bio generation status error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
