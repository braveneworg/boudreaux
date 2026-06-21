/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ReleaseService } from '@/lib/services/release-service';

import { runAdminEntityAction } from './run-admin-entity-action';

/**
 * Server action to hard-delete a release. `ReleaseService.deleteRelease` cascades
 * to the release's related records and S3 objects (digital-format files and
 * images) but preserves Artist records. Returns a plain result the
 * {@link useDeleteReleaseMutation} hook maps to a toast.
 */
export const deleteReleaseAction = async (
  releaseId: string
): Promise<{ success: boolean; error?: string }> =>
  runAdminEntityAction({
    id: releaseId,
    entityLabel: 'release',
    perform: (id) => ReleaseService.deleteRelease(id),
    event: 'media.release.deleted',
    metadataKey: 'releaseId',
    revalidate: ['/admin/releases', '/releases'],
    failureError: 'Failed to delete release',
  });
