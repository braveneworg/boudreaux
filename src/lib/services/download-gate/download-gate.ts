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
  Denial,
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

/** One release of a multi-release download, granted. */
export interface GrantedRelease {
  request: DownloadRequest;
  releaseId: string;
  grant: Grant;
  records: GateFormatRecord[];
  facts: DownloadFacts;
}

export type ManyProducer<D extends Deliverable> = (grants: GrantedRelease[]) => Promise<D>;

export type ManyOutcome<D extends Deliverable> =
  | { ok: true; grants: GrantedRelease[]; deliverable: D }
  | { ok: false; denial: Denial; releaseId: string }
  | { ok: false; denial: null; reason: 'NOT_FOUND' | 'LOCK_HELD'; releaseId?: string };

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
    const outcome = await this.downloadMany(
      [request],
      ([{ grant, records }]) => produce(grant, records),
      audit
    );
    return outcome.ok
      ? { ok: true, grant: outcome.grants[0].grant, deliverable: outcome.deliverable }
      : outcome.denial === null
        ? { ok: false, denial: null, reason: outcome.reason }
        : { ok: false, denial: outcome.denial };
  }

  async checkMany(requests: DownloadRequest[]): Promise<CheckResult[]> {
    return Promise.all(requests.map((request) => this.check(request)));
  }

  /**
   * Several releases for one subject as one download (a playlist zip):
   * one lock, every release decided before anything is produced, and
   * all-or-nothing — a single refusal names its release and charges nothing.
   */
  async downloadMany<D extends Deliverable>(
    requests: DownloadRequest[],
    produce: ManyProducer<D>,
    audit: AuditContext
  ): Promise<ManyOutcome<D>> {
    const [first] = requests;
    const key = lockKey(first.subject);
    if (!this.deps.lock.acquire(key, this.deps.now().getTime())) {
      return { ok: false, denial: null, reason: 'LOCK_HELD' };
    }
    try {
      const grants: GrantedRelease[] = [];
      for (const request of requests) {
        const outcome = await this.decideRelease(request, audit);
        if (outcome.kind === 'not-found') {
          return { ok: false, denial: null, reason: 'NOT_FOUND', releaseId: request.releaseId };
        }
        if (outcome.kind === 'denied') {
          return { ok: false, denial: outcome.denial, releaseId: request.releaseId };
        }
        grants.push(outcome.granted);
      }

      // Every release was decided against the same uncharged lifetime state,
      // so the set as a whole must also fit: three new releases with two
      // slots left is refused outright rather than partially charged.
      const overrun = lifetimeOverrun(grants);
      if (overrun !== null) {
        await this.deps.counters.recordFailure({
          subject: overrun.request.subject,
          releaseId: overrun.request.releaseId,
          formats: overrun.request.formats,
          errorCode: 'LIFETIME_CAP',
          mode: 'free',
          audit,
        });
        return {
          ok: false,
          denial: { kind: 'denial', reason: 'LIFETIME_CAP' },
          releaseId: overrun.releaseId,
        };
      }

      let deliverable: D;
      try {
        deliverable = await produce(grants);
      } catch (error) {
        await Promise.all(
          grants.map(({ request, grant }) =>
            this.deps.counters.recordFailure({
              subject: request.subject,
              releaseId: request.releaseId,
              formats: request.formats,
              errorCode: STREAM_FAILED,
              mode: grant.mode,
              audit,
            })
          )
        );
        throw error;
      }

      const now = this.deps.now();
      for (const { request, grant, facts } of grants) {
        await this.deps.counters.commit({
          subject: request.subject,
          releaseId: request.releaseId,
          grant,
          facts,
          now,
          audit,
        });
      }
      return { ok: true, grants, deliverable };
    } finally {
      this.deps.lock.release(key);
    }
  }

  /** Facts → decision for one release, recording a denial as it goes. */
  private async decideRelease(
    request: DownloadRequest,
    audit: AuditContext
  ): Promise<
    | { kind: 'not-found' }
    | { kind: 'denied'; denial: Denial }
    | { kind: 'granted'; granted: GrantedRelease }
  > {
    const gathered = await this.gather(request);
    if (gathered === null) {
      return { kind: 'not-found' };
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
      return { kind: 'denied', denial: decision };
    }
    const granted = decision.formats
      .map(({ formatType }) => records.get(formatType))
      .filter(isRecord);
    return {
      kind: 'granted',
      granted: { request, releaseId: request.releaseId, grant: decision, records: granted, facts },
    };
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
        .filter((format): format is GateFormat => format !== null && !format.withdrawn)
        .map(({ formatType }) => formatType)
        .filter(isFreeFormatType),
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

/**
 * The first granted release the set cannot afford: the lifetime charges it
 * would make, counted together, exceed the slots the subject has left.
 */
const lifetimeOverrun = (grants: GrantedRelease[]): GrantedRelease | null => {
  const charging = grants.filter(({ grant }) => grant.charge.lifetime);
  const [first] = charging;
  if (first === undefined || first.facts.lifetime === null) {
    return null;
  }
  // Slots left can only be positive here (a charging grant passed its own
  // per-release cap check), but a negative index would count from the end.
  const remaining = Math.max(0, MAX_FREE_DOWNLOAD_QUOTA - first.facts.lifetime.distinctReleases);
  return charging.at(remaining) ?? null;
};

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
