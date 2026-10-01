/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  FREE_DOWNLOAD_CAP,
  isFreeFormatType,
  isValidFormatType,
  MAX_FREE_DOWNLOAD_QUOTA,
  type DigitalFormatType,
} from '@/lib/constants/digital-formats';
import {
  ReleaseDigitalFormatRepository,
  type ReleaseDigitalFormatWithFiles,
} from '@/lib/repositories/release-digital-format-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { isUserSubject, type DownloadSubject } from '@/types/download-subject';

import { prismaCounters, type AuditContext, type DownloadCounters } from './counters';
import { decide, freeThrottleResetsAt, purchaseThrottleResetInHours } from './decide';
import { inProcessDownloadLock, type DownloadLock } from './lock';

import type {
  Decision,
  Deliverable,
  DownloadFacts,
  DownloadRequest,
  DownloadStatus,
  GateFormat,
  Grant,
  Outcome,
} from './types';

/** A release's digital format as the repository returns it, child files included. */
export type GateFormatRecord = ReleaseDigitalFormatWithFiles;

/** What a route supplies for a Grant: the deliverable, built from the granted records. */
export type Producer<D extends Deliverable> = (
  grant: Grant,
  records: GateFormatRecord[]
) => Promise<D>;

export interface DownloadGateDeps {
  counters: DownloadCounters;
  lock: DownloadLock;
  /** Whether the release exists and is listed (published, not deleted). */
  releaseIsListed: (releaseId: string) => Promise<boolean>;
  /** Every digital format of the release, withdrawn ones included. */
  formatsOf: (releaseId: string) => Promise<GateFormatRecord[]>;
  now: () => Date;
}

/** `Decision` plus the one answer the facts cannot give: the release is gone. */
export type CheckResult = Decision | { kind: 'not-found' };

const STREAM_FAILED = 'STREAM_FAILED';

const lockKey = (subject: DownloadSubject): string =>
  isUserSubject(subject) ? `user:${subject.userId}` : `guest:${subject.visitorId}`;

const toGateFormat = ({ formatType, deletedAt }: GateFormatRecord): GateFormat | null =>
  isValidFormatType(formatType) ? { formatType, withdrawn: deletedAt !== null } : null;

/**
 * The download gate (ADR-0018, CONTEXT.md "download gate"): the one decision
 * "may this subject download these formats of this release" and the charge
 * against the matching cap or throttle, made only once the deliverable
 * exists. Routes are adapters: they resolve the subject, hand the gate a
 * producer, and map the Outcome to a response.
 *
 * `download`: lock → facts → decide → produce → commit → unlock.
 * `check`: facts → decide, for preflights — no lock, no charge.
 * `status`: the read-only view the download dialog and status routes show.
 */
export class DownloadGate {
  constructor(private readonly deps: DownloadGateDeps) {}

  async check(request: DownloadRequest): Promise<CheckResult> {
    const gathered = await this.gather(request);
    return gathered === null ? { kind: 'not-found' } : decide(gathered.facts);
  }

  async download<D extends Deliverable>(
    request: DownloadRequest,
    produce: Producer<D>,
    audit: AuditContext
  ): Promise<Outcome<D>> {
    const key = lockKey(request.subject);
    if (!this.deps.lock.acquire(key, this.deps.now().getTime())) {
      return { ok: false, denial: null, reason: 'LOCK_HELD' };
    }
    try {
      const gathered = await this.gather(request);
      if (gathered === null) {
        return { ok: false, denial: null, reason: 'NOT_FOUND' };
      }
      const { facts, records } = gathered;
      const decision = decide(facts);
      if (decision.kind === 'denial') {
        await this.deps.counters.recordFailure({
          subject: request.subject,
          releaseId: request.releaseId,
          formats: request.formats,
          errorCode: decision.reason,
          mode: facts.entitled ? 'purchased' : 'free',
          audit,
        });
        return { ok: false, denial: decision };
      }

      const granted = decision.formats
        .map(({ formatType }) => records.get(formatType))
        .filter(isRecord);
      let deliverable: D;
      try {
        deliverable = await produce(decision, granted);
      } catch (error) {
        await this.deps.counters.recordFailure({
          subject: request.subject,
          releaseId: request.releaseId,
          formats: request.formats,
          errorCode: STREAM_FAILED,
          mode: decision.mode,
          audit,
        });
        throw error;
      }

      await this.deps.counters.commit({
        subject: request.subject,
        releaseId: request.releaseId,
        grant: decision,
        facts,
        now: this.deps.now(),
        audit,
      });
      return { ok: true, grant: decision, deliverable };
    } finally {
      this.deps.lock.release(key);
    }
  }

  async status(subject: DownloadSubject, releaseId: string): Promise<DownloadStatus | null> {
    if (!(await this.deps.releaseIsListed(releaseId))) {
      return null;
    }
    const now = this.deps.now();
    const [counters, records] = await Promise.all([
      this.deps.counters.read(subject, releaseId, now),
      this.deps.formatsOf(releaseId),
    ]);
    const freeRemaining = Math.max(0, FREE_DOWNLOAD_CAP - counters.freeThrottle.count);
    return {
      entitled: counters.entitled,
      mode: counters.entitled ? 'purchased' : 'free',
      availableFreeFormats: records
        .map(toGateFormat)
        .filter((format): format is GateFormat => format !== null)
        .filter(({ formatType, withdrawn }) => isFreeFormatType(formatType) && !withdrawn)
        .map(({ formatType }) => formatType),
      freeThrottle: {
        allowed: freeRemaining > 0,
        remaining: freeRemaining,
        resetsAt:
          counters.freeThrottle.oldestInWindow === null
            ? null
            : freeThrottleResetsAt(counters.freeThrottle, now),
      },
      lifetime:
        counters.lifetime === null
          ? null
          : {
              remaining: Math.max(0, MAX_FREE_DOWNLOAD_QUOTA - counters.lifetime.distinctReleases),
              includesThisRelease: counters.lifetime.includesThisRelease,
            },
      purchaseThrottle:
        counters.purchaseThrottle === null
          ? null
          : {
              count: counters.purchaseThrottle.count,
              resetInHours: purchaseThrottleResetInHours(counters.purchaseThrottle, now),
            },
    };
  }

  /** The facts `decide` needs, and the records behind each available format. */
  private async gather(
    request: DownloadRequest
  ): Promise<{ facts: DownloadFacts; records: Map<DigitalFormatType, GateFormatRecord> } | null> {
    if (!(await this.deps.releaseIsListed(request.releaseId))) {
      return null;
    }
    const now = this.deps.now();
    const [counters, formatRecords] = await Promise.all([
      this.deps.counters.read(request.subject, request.releaseId, now),
      this.deps.formatsOf(request.releaseId),
    ]);
    const records = new Map<DigitalFormatType, GateFormatRecord>();
    const available: GateFormat[] = [];
    for (const record of formatRecords) {
      const format = toGateFormat(record);
      if (format !== null) {
        records.set(format.formatType, record);
        available.push(format);
      }
    }
    return {
      facts: {
        subject: request.subject,
        releaseId: request.releaseId,
        requested: request.formats,
        available,
        ...counters,
        now,
      },
      records,
    };
  }
}

const isRecord = (record: GateFormatRecord | undefined): record is GateFormatRecord =>
  record !== undefined;

const formatRepository = new ReleaseDigitalFormatRepository();

/** The production gate: Prisma-backed counters, the in-process lock, listed releases. */
export const downloadGate = new DownloadGate({
  counters: prismaCounters,
  lock: inProcessDownloadLock,
  releaseIsListed: async (releaseId) =>
    (await ReleaseRepository.findPublishedTitleById(releaseId)) !== null,
  formatsOf: (releaseId) => formatRepository.findAllByReleaseIncludingWithdrawn(releaseId),
  now: () => new Date(),
});
