/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ReleaseService } from '@/lib/services/release-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to publish a release (stamps `publishedAt`). Returns a plain
 * result the {@link usePublishReleaseMutation} hook maps to a toast.
 */
export const publishReleaseAction = async (releaseId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: releaseId,
    entityLabel: 'release',
    perform: (id) => ReleaseService.publishRelease(id),
    event: 'media.release.published',
    metadataKey: 'releaseId',
    revalidate: ['/admin/releases', '/releases'],
    failureError: 'Failed to publish release',
  });
