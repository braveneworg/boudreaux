/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import type { DownloadSubject } from '@/types/download-subject';

/**
 * The download gate's vocabulary (ADR-0018, CONTEXT.md "download gate").
 *
 * A request carries intent only — who, which release, which formats. The gate
 * gathers the facts, `decide` turns facts into a Grant or a Denial, the route
 * produces the deliverable for a Grant, and the gate charges the counters.
 */

/** Which rules a download runs under. Decided by the gate, never requested. */
export type DownloadMode = 'free' | 'purchased';

/** A digital format of the release as the gate sees it. */
export interface GateFormat {
  formatType: DigitalFormatType;
  /** Soft-deleted: the free tier never gets it; entitlement still does. */
  withdrawn: boolean;
}

/** What the gate knows before it decides. Gathered by the gate, not the route. */
export interface DownloadFacts {
  subject: DownloadSubject;
  releaseId: string;
  /** The formats the subject asked for, already validated as format types. */
  requested: DigitalFormatType[];
  /** Every format the release has, withdrawn ones included. */
  available: GateFormat[];
  /** A non-refunded purchase exists for this user and release. Always false for a guest. */
  entitled: boolean;
  /** Lifetime cap state — signed-in users only; a guest has no lifetime cap. */
  lifetime: LifetimeCapFacts | null;
  /** Free throttle state for this subject and release. */
  freeThrottle: WindowFacts;
  /** Purchase throttle state — only read when entitled. */
  purchaseThrottle: PurchaseThrottleFacts | null;
  now: Date;
}

export interface LifetimeCapFacts {
  /** Distinct releases this user has taken free so far. */
  distinctReleases: number;
  /** This release is already among them, so it costs nothing more. */
  includesThisRelease: boolean;
}

export interface WindowFacts {
  /** Free downloads of this release by this subject inside the rolling window. */
  count: number;
  /** When the oldest counted download happened, or null when none. */
  oldestInWindow: Date | null;
}

export interface PurchaseThrottleFacts {
  count: number;
  lastDownloadedAt: Date | null;
}

/** The gate's yes: the mode, the formats to deliver, and what to charge. */
export interface Grant {
  kind: 'grant';
  mode: DownloadMode;
  formats: GateFormat[];
  /** Counters `commit` will touch once the deliverable exists. */
  charge: Charge;
}

export interface Charge {
  /** Add this release to the user's lifetime set (free mode, users only, first time). */
  lifetime: boolean;
  /** Write a counted free-throttle row (free mode). */
  freeThrottle: boolean;
  /** Bump the purchase throttle (purchased mode). */
  purchaseThrottle: boolean;
}

export type DenialReason =
  'NO_FILES' | 'PURCHASE_REQUIRED' | 'DELETED' | 'LIFETIME_CAP' | 'THROTTLED' | 'DOWNLOAD_LIMIT';

/** The gate's no, with the fact a client can act on. */
export interface Denial {
  kind: 'denial';
  reason: DenialReason;
  /** THROTTLED: when the oldest counted download ages out of the window. */
  resetsAt?: Date;
  /** DOWNLOAD_LIMIT: whole hours until the purchase throttle resets. */
  resetInHours?: number;
  /** PURCHASE_REQUIRED / DELETED: the formats that caused it. */
  formats?: DigitalFormatType[];
}

export type Decision = Grant | Denial;

/** What a route hands the gate: intent only. */
export interface DownloadRequest {
  subject: DownloadSubject;
  releaseId: string;
  formats: DigitalFormatType[];
}

/** What the route produces for a Grant. Commit happens once this exists. */
export type Deliverable =
  { kind: 'url'; downloadUrl: string; fileName: string } | { kind: 'stream'; response: Response };

export type Outcome<D extends Deliverable = Deliverable> =
  | { ok: true; grant: Grant; deliverable: D }
  | { ok: false; denial: Denial }
  | { ok: false; denial: null; reason: 'NOT_FOUND' | 'LOCK_HELD' };

/** Read-only view for the status endpoints and the download dialog. */
export interface DownloadStatus {
  entitled: boolean;
  /** The mode a download would run under right now. */
  mode: DownloadMode;
  /** The release's free formats that are not withdrawn — what the free tier may take. */
  availableFreeFormats: DigitalFormatType[];
  freeThrottle: { allowed: boolean; remaining: number; resetsAt: Date | null };
  /** Signed-in users only. */
  lifetime: { remaining: number; includesThisRelease: boolean } | null;
  /** Entitled subjects only. */
  purchaseThrottle: { count: number; resetInHours: number | null } | null;
}
