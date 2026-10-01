/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

/**
 * Purchase checks for checkout. Whether a purchase lets its holder download
 * — and how often — is the download gate's question (ADR-0018), not this
 * service's.
 */
export class PurchaseService {
  /** Returns true if the user has a non-refunded purchase for the given release. */
  static async checkExistingPurchase(userId: string, releaseId: string): Promise<boolean> {
    const purchase = await PurchaseRepository.findByUserAndRelease(userId, releaseId);
    return purchase !== null;
  }
}
