/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { VisitorIdentityRepository } from '@/lib/repositories/visitor-identity-repository';

/**
 * Guest identity (CONTEXT.md "download subject"): who an anonymous visitor
 * is, resolved from the `boudreaux_visitor_id` cookie and a browser
 * fingerprint. Answers "who is this", never "may they download" — that is
 * the download gate's question (ADR-0018).
 *
 * Four branches: a valid cookie with a row (union in a fingerprint row that
 * points elsewhere); a valid cookie with no row yet (adopt it); no cookie but
 * a fingerprint match (recover, reissue the cookie); a full miss (mint a new
 * id, reissue the cookie).
 */
export interface ResolveVisitorIdentityInput {
  /** Existing `boudreaux_visitor_id` cookie value, or null when missing/invalid. */
  cookieValue: string | null;
  /** SHA-256 fingerprint hash for this request. */
  fingerprintHash: string;
  now?: Date;
}

export interface ResolvedVisitorIdentity {
  /** Canonical visitorId for the request. Caller should set/refresh the cookie to this value. */
  primaryVisitorId: string;
  /** All visitorIds whose events should count toward the cap (≥1, includes primary). */
  allVisitorIds: string[];
  /** True when the caller must issue or rewrite the cookie. */
  cookieReissue: boolean;
}

export class GuestIdentityService {
  constructor(
    private readonly visitorIdentityRepo: VisitorIdentityRepository = new VisitorIdentityRepository(),
    private readonly mintVisitorId: () => string = () => crypto.randomUUID()
  ) {}

  async resolveVisitorIdentity(
    input: ResolveVisitorIdentityInput
  ): Promise<ResolvedVisitorIdentity> {
    const now = input.now ?? new Date();
    const cookieValue = input.cookieValue?.trim() || null;

    // Branch 1: cookie valid + row exists.
    if (cookieValue !== null) {
      const cookieRow = await this.visitorIdentityRepo.findByVisitorId(cookieValue);
      if (cookieRow !== null) {
        await this.visitorIdentityRepo.upsert(
          { visitorId: cookieValue, fingerprintHash: input.fingerprintHash },
          now
        );

        const allVisitorIds = [cookieValue];
        const fingerprintRow = await this.visitorIdentityRepo.findByFingerprintHash(
          input.fingerprintHash
        );
        if (fingerprintRow !== null && fingerprintRow.visitorId !== cookieValue) {
          allVisitorIds.push(fingerprintRow.visitorId);
        }

        return {
          primaryVisitorId: cookieValue,
          allVisitorIds,
          cookieReissue: false,
        };
      }

      // Branch 2: cookie valid but no row yet — adopt it.
      await this.visitorIdentityRepo.upsert(
        { visitorId: cookieValue, fingerprintHash: input.fingerprintHash },
        now
      );
      return {
        primaryVisitorId: cookieValue,
        allVisitorIds: [cookieValue],
        cookieReissue: false,
      };
    }

    // Branches 3 & 4: no cookie. Try fingerprint recovery.
    const fingerprintRow = await this.visitorIdentityRepo.findByFingerprintHash(
      input.fingerprintHash
    );
    if (fingerprintRow !== null) {
      await this.visitorIdentityRepo.upsert(
        { visitorId: fingerprintRow.visitorId, fingerprintHash: input.fingerprintHash },
        now
      );
      return {
        primaryVisitorId: fingerprintRow.visitorId,
        allVisitorIds: [fingerprintRow.visitorId],
        cookieReissue: true,
      };
    }

    // Branch 4: full miss.
    const minted = this.mintVisitorId();
    await this.visitorIdentityRepo.upsert(
      { visitorId: minted, fingerprintHash: input.fingerprintHash },
      now
    );
    return {
      primaryVisitorId: minted,
      allVisitorIds: [minted],
      cookieReissue: true,
    };
  }
}

export const guestIdentityService = new GuestIdentityService();
