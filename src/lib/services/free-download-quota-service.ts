/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { VisitorIdentityRepository } from '@/lib/repositories/visitor-identity-repository';
import { loggers } from '@/lib/utils/logger';
import type { DownloadSubject } from '@/types/download-subject';

/**
 * Free-download cap and identity-resolution service (007-free-digital-downloads).
 *
 * Implements the rolling-24h, 3-downloads-per-release cap (Session 2026-05-07 Q1)
 * keyed by either an authenticated `userId` or a composite anonymous identity
 * (`visitorId` + `fingerprintHash`). Identity-resolution and cap enforcement
 * are intentionally split:
 *
 * - {@link resolveVisitorIdentity} — four-branch algorithm per
 *   research.md §R-6, plus identity-conflict union (Session 2026-05-08 Q1).
 * - {@link assertFreeDownloadAllowed} — pure cap query; throws
 *   {@link CapReachedError} when the visitor is at quota.
 * - {@link recordSuccessfulDownload} — the single point that increments the
 *   cap by writing a `DownloadEvent { success: true }` row, intended to be
 *   called immediately before the SSE `ready` event is emitted (Session
 *   2026-05-08 Q3).
 */

/** Cap = 3 successful downloads per (subject, release) per 24h rolling window. */
export const FREE_DOWNLOAD_CAP = 3;
/** Rolling window length, in milliseconds. */
export const FREE_DOWNLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;

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

export interface CapStatus {
  allowed: boolean;
  /** Remaining downloads in the current window, never negative. */
  remaining: number;
  count: number;
  oldestInWindow: Date | null;
  /** When the oldest counted event ages out (= oldestInWindow + windowMs), or null. */
  resetsAt: Date | null;
}

export class CapReachedError extends Error {
  public readonly code = 'CAP_REACHED' as const;
  constructor(public readonly resetsAt: Date) {
    super('Free-download cap reached');
    this.name = 'CapReachedError';
  }
}

export interface AssertAllowedParams {
  subject: DownloadSubject;
  /** When subject is a guest, the union of visitorIds (defaults to [subject.visitorId]). */
  visitorIds?: string[];
  releaseId: string;
  now?: Date;
}

export interface RecordSuccessfulDownloadParams {
  subject: DownloadSubject;
  releaseId: string;
  formatType: DigitalFormatType;
  ipAddress?: string;
  userAgent?: string;
}

export class FreeDownloadQuotaService {
  constructor(
    private readonly visitorIdentityRepo: VisitorIdentityRepository = new VisitorIdentityRepository(),
    private readonly downloadEventRepo: DownloadEventRepository = new DownloadEventRepository(),
    private readonly mintVisitorId: () => string = () => crypto.randomUUID()
  ) {}

  /**
   * Resolve the canonical visitor identity for an anonymous request.
   *
   * Four-branch algorithm (research.md §R-6):
   *  1. Cookie valid + row exists → use cookie's visitorId; refresh hash.
   *     If fingerprint matches a *different* row, union both ids without
   *     merging the records (Session 2026-05-08 Q1).
   *  2. Cookie valid + no row → create row keyed by cookieValue.
   *  3. Cookie missing/invalid + fingerprint matches existing row →
   *     reuse that visitorId, signal cookie reissue.
   *  4. Full miss → mint UUID, create row, signal cookie reissue.
   */
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

  /**
   * Throws {@link CapReachedError} when the subject has already used all
   * {@link FREE_DOWNLOAD_CAP} downloads for this release inside the rolling
   * window. Otherwise returns the current cap status.
   */
  async assertFreeDownloadAllowed(params: AssertAllowedParams): Promise<CapStatus> {
    const now = params.now ?? new Date();
    const windowStart = new Date(now.getTime() - FREE_DOWNLOAD_WINDOW_MS);

    const { count, oldestInWindow } =
      params.subject.kind === 'user'
        ? await this.downloadEventRepo.countSuccessfulDownloadsInWindow({
            userId: params.subject.userId,
            releaseId: params.releaseId,
            windowStart,
          })
        : await this.downloadEventRepo.countSuccessfulDownloadsInWindow({
            visitorIds: params.visitorIds ?? [params.subject.visitorId],
            releaseId: params.releaseId,
            windowStart,
          });

    const remaining = Math.max(0, FREE_DOWNLOAD_CAP - count);
    const resetsAt =
      oldestInWindow !== null ? new Date(oldestInWindow.getTime() + FREE_DOWNLOAD_WINDOW_MS) : null;

    if (count >= FREE_DOWNLOAD_CAP) {
      // resetsAt is non-null whenever count > 0; safe to cast via local guard.
      const reset = resetsAt ?? new Date(now.getTime() + FREE_DOWNLOAD_WINDOW_MS);
      loggers.downloads.warn('Per-release free download cap reached', {
        subjectKind: params.subject.kind,
        ...(params.subject.kind === 'user' && { userId: params.subject.userId }),
        releaseId: params.releaseId,
        count,
        resetsAt: reset.toISOString(),
      });
      throw new CapReachedError(reset);
    }

    return {
      allowed: true,
      remaining,
      count,
      oldestInWindow,
      resetsAt,
    };
  }

  /**
   * Record a successful free-tier download. Single point that increments
   * the cap. Called immediately before the SSE `ready` event is emitted.
   */
  async recordSuccessfulDownload(params: RecordSuccessfulDownloadParams): Promise<void> {
    await this.downloadEventRepo.logDownloadEvent({
      userId: params.subject.kind === 'user' ? params.subject.userId : null,
      visitorId: params.subject.kind === 'guest' ? params.subject.visitorId : null,
      releaseId: params.releaseId,
      formatType: params.formatType,
      success: true,
      ipAddress: params.ipAddress ?? '',
      userAgent: params.userAgent ?? '',
    });
  }
}

export const freeDownloadQuotaService = new FreeDownloadQuotaService();
