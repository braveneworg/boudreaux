/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { withPublicReleaseByline } from '@/lib/utils/artist-release-credits';
import { loggers } from '@/lib/utils/logger';

/**
 * Fetch all purchases for the currently authenticated user.
 * Returns an array of purchase records with release details.
 */
export const getCollectionAction = async () => {
  const gate = await gateAction('signed-in');
  if (!gate.success) {
    return { ...gate, data: [] };
  }
  const { session } = gate;

  try {
    const purchases = (await PurchaseRepository.findAllByUser(session.user.id)).map(
      withPublicReleaseByline
    );
    return { success: true, data: purchases };
  } catch (error) {
    loggers.media.error('[getCollectionAction] Failed to fetch collection', error);
    return { success: false, error: 'Failed to load collection', data: [] };
  }
};

/**
 * Delete a purchase record by ID. Admin-only operation for testing purposes.
 */
export const deletePurchaseAction = async (purchaseId: string) => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  try {
    await PurchaseRepository.deleteById(purchaseId);
    revalidatePath('/collection');
    return { success: true };
  } catch (error) {
    loggers.media.error('[deletePurchaseAction] Failed to delete purchase', error);
    return { success: false, error: 'Failed to delete purchase' };
  }
};
