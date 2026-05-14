/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { BannedIdentityRepository } from '@/lib/repositories/banned-identity-repository';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';

export interface BanCheckRequest {
  /** Authenticated user id, when known (skip at pre-signup time). */
  userId?: string | null;
  /** Account email, normalized to lowercase server-side. */
  email?: string | null;
  /** Raw `user-agent` request header. */
  userAgent?: string | null;
  /** Raw `accept-language` request header. */
  acceptLanguage?: string | null;
  /** Resolved client IP (after `x-real-ip` / `x-forwarded-for` rules). */
  ip?: string | null;
}

export interface BanCheckResult {
  banned: boolean;
  /** When `banned`, the reason recorded on the matching {@link BannedIdentity}. */
  reason?: string | null;
}

/**
 * Centralized ban-evasion check. Computes the request's server-side
 * fingerprint hash (deterministic over UA + Accept-Language + IP /24)
 * and looks up an active {@link BannedIdentity} matching any of:
 * userId, email, or fingerprint hash.
 *
 * Call this from:
 * - Auth callbacks (`signIn`) — reject sign-in for banned identities
 * - Signup mutation — reject account creation for banned email or
 *   matching fingerprint
 * - Chat message send and abuse-report submit (defense-in-depth)
 */
export class BanEvasionService {
  static async check(request: BanCheckRequest): Promise<BanCheckResult> {
    const fingerprintHash = computeFingerprintHash({
      userAgent: request.userAgent,
      acceptLanguage: request.acceptLanguage,
      ip: request.ip,
    });

    const match = await BannedIdentityRepository.findActiveMatch({
      userId: request.userId ?? null,
      email: request.email ?? null,
      fingerprintHash,
    });

    if (!match) return { banned: false };
    return { banned: true, reason: match.reason };
  }

  /** Convenience: compute the request fingerprint hash without a lookup. */
  static fingerprintFor(
    request: Pick<BanCheckRequest, 'userAgent' | 'acceptLanguage' | 'ip'>
  ): string {
    return computeFingerprintHash({
      userAgent: request.userAgent,
      acceptLanguage: request.acceptLanguage,
      ip: request.ip,
    });
  }
}
