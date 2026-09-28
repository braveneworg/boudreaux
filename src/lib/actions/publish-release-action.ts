/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ReleaseService } from '@/lib/services/release-service';
import {
  creditDecisionsSchema,
  type CreditDecisionsInput,
} from '@/lib/validation/credit-decisions-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to publish a release (stamps `publishedAt`) and the credited
 * artists the admin chose to publish. Every credit awaiting confirmation needs
 * a decision — publish or keep hidden — or the service fails with the artists'
 * names and nothing is written (ADR-0015). Returns a plain result the
 * {@link usePublishReleaseMutation} hook maps to a toast.
 */
export const publishReleaseAction = async (
  releaseId: string,
  decisions: CreditDecisionsInput = {}
): Promise<AdminActionResult> => {
  const parsed = creditDecisionsSchema.safeParse(decisions);
  if (!parsed.success) {
    return { success: false, error: 'Invalid artist decisions' };
  }

  return runAdminEntityAction({
    id: releaseId,
    entityLabel: 'release',
    perform: (id, adminUserId) =>
      ReleaseService.publishRelease(id, { decisions: parsed.data, publishedBy: adminUserId }),
    event: 'media.release.published',
    metadataKey: 'releaseId',
    // Publishing can make credited artists public, so their pages change too.
    revalidate: ['/admin/releases', '/releases', '/admin/artists', '/artists'],
    failureError: 'Failed to publish release',
  });
};
