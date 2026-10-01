/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/decorators/with-auth';
import { ArtistService } from '@/lib/services/artist-service';
import { httpStatusForCode } from '@/lib/utils/http-status-for-code';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

/**
 * GET /api/artist/[id]
 * Get a single artist by ID — admin only. The by-id payload is the full admin
 * row the edit form loads (contact PII, notes, audit actors, and the live job
 * callback tokens), so it is never public and never shared-cached (#765).
 * Public surfaces read artists by slug through the public projection.
 */
export const GET = withAdmin(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
      }

      const result = await ArtistService.getArtistById(id);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: httpStatusForCode(result.code) }
        );
      }

      return NextResponse.json(result.data, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (error) {
      loggers.media.error('Artist GET by ID error', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);

// Hard delete moved to the `deleteArtistAction` Server Action (mutations are
// Server Actions per src/AGENTS.md); this route serves reads and form updates.
