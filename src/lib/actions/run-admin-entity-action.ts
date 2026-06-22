/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

import type { AuditEvent } from '@/lib/utils/audit-log';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

/**
 * The plain success/error result shared by admin-gated Server Actions (delete,
 * publish, publish-to-site, …) and consumed by their mutation hooks, which map
 * it to a toast. Distinct from form Server Actions, which return `FormState`.
 */
export interface AdminActionResult {
  success: boolean;
  error?: string;
}

/** A service call that resolves to a success/error result (ServiceResponse-shaped). */
type EntityServiceCall = (id: string) => Promise<AdminActionResult>;

interface RunAdminEntityActionConfig {
  /** The target entity id (validated as a Mongo ObjectId). */
  id: string;
  /** Human label used in the "Invalid {label} ID" message, e.g. `'featured artist'`. */
  entityLabel: string;
  /** Performs the mutation via a service method. */
  perform: EntityServiceCall;
  /** Audit event logged on success. */
  event: AuditEvent;
  /** Metadata key the id is logged under, e.g. `'featuredArtistId'`. */
  metadataKey: string;
  /** Paths to revalidate on success. */
  revalidate: string[];
  /** Message returned when `perform` throws unexpectedly, e.g. `'Failed to delete release'`. */
  failureError: string;
}

/**
 * Shared admin-entity mutation runner for single-id Server Actions (delete,
 * publish, restore). Centralizes the common contract — admin gate → ObjectId
 * validation → service call → audit log → path revalidation → plain result —
 * so each action file is a thin, declarative config. Returns the plain
 * `{ success, error? }` shape the mutation hooks map to a toast.
 */
export const runAdminEntityAction = async ({
  id,
  entityLabel,
  perform,
  event,
  metadataKey,
  revalidate,
  failureError,
}: RunAdminEntityActionConfig): Promise<AdminActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!isValidObjectId(id)) {
    return { success: false, error: `Invalid ${entityLabel} ID` };
  }

  try {
    const result = await perform(id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    logSecurityEvent({ event, userId: session.user.id, metadata: { [metadataKey]: id } });

    for (const path of revalidate) {
      revalidatePath(path);
    }

    return { success: true };
  } catch {
    return { success: false, error: failureError };
  }
};
