/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { decide } from './decide';

import type { DownloadFacts, GateFormat } from './types';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const mp3: GateFormat = { formatType: 'MP3_320KBPS', withdrawn: false };
const aac: GateFormat = { formatType: 'AAC', withdrawn: false };
const flac: GateFormat = { formatType: 'FLAC', withdrawn: false };
const withdrawnAac: GateFormat = { formatType: 'AAC', withdrawn: true };

const user = { kind: 'user', userId: 'user-1' } as const;
const guest = { kind: 'guest', visitorId: 'visitor-1' } as const;

/** A free-tier user with every counter at zero, asking for the free bundle. */
const base = (overrides: Partial<DownloadFacts> = {}): DownloadFacts => ({
  subject: user,
  releaseId: 'release-1',
  requested: ['MP3_320KBPS', 'AAC'],
  available: [mp3, aac, flac],
  entitled: false,
  lifetime: { distinctReleases: 0, includesThisRelease: false },
  freeThrottle: { count: 0, oldestInWindow: null },
  purchaseThrottle: null,
  now: NOW,
  ...overrides,
});

describe('decide — formats', () => {
  it('denies NO_FILES when none of the requested formats exist on the release', () => {
    expect(decide(base({ requested: ['WAV'] }))).toEqual({ kind: 'denial', reason: 'NO_FILES' });
  });

  it('delivers the requested formats that exist, in request order, and ignores the rest', () => {
    const decision = decide(base({ requested: ['AAC', 'WAV', 'MP3_320KBPS'] }));

    expect(decision).toMatchObject({ kind: 'grant', formats: [aac, mp3] });
  });
});

describe('decide — free tier', () => {
  it('grants free mode to a user without entitlement, charging lifetime and throttle', () => {
    expect(decide(base())).toEqual({
      kind: 'grant',
      mode: 'free',
      formats: [mp3, aac],
      charge: { lifetime: true, freeThrottle: true, purchaseThrottle: false },
    });
  });

  it('grants a guest free mode with no lifetime charge', () => {
    expect(decide(base({ subject: guest, lifetime: null }))).toMatchObject({
      kind: 'grant',
      mode: 'free',
      charge: { lifetime: false, freeThrottle: true, purchaseThrottle: false },
    });
  });

  it('denies PURCHASE_REQUIRED naming the non-free formats', () => {
    expect(decide(base({ requested: ['MP3_320KBPS', 'FLAC'] }))).toEqual({
      kind: 'denial',
      reason: 'PURCHASE_REQUIRED',
      formats: ['FLAC'],
    });
  });

  it('denies DELETED naming the withdrawn formats — the free tier never gets them', () => {
    expect(decide(base({ available: [mp3, withdrawnAac, flac] }))).toEqual({
      kind: 'denial',
      reason: 'DELETED',
      formats: ['AAC'],
    });
  });

  it('puts PURCHASE_REQUIRED before DELETED when both apply', () => {
    const facts = base({
      requested: ['AAC', 'FLAC'],
      available: [mp3, withdrawnAac, { formatType: 'FLAC', withdrawn: true }],
    });

    expect(decide(facts)).toMatchObject({ reason: 'PURCHASE_REQUIRED', formats: ['FLAC'] });
  });

  it('denies LIFETIME_CAP once five distinct releases were taken free', () => {
    const facts = base({ lifetime: { distinctReleases: 5, includesThisRelease: false } });

    expect(decide(facts)).toEqual({ kind: 'denial', reason: 'LIFETIME_CAP' });
  });

  it('lets a capped user re-download a release already in the lifetime set, charging nothing to it', () => {
    const facts = base({ lifetime: { distinctReleases: 5, includesThisRelease: true } });

    expect(decide(facts)).toMatchObject({
      kind: 'grant',
      charge: { lifetime: false, freeThrottle: true },
    });
  });

  it('denies THROTTLED at three downloads in the window, with the reset moment', () => {
    const oldest = new Date(NOW.getTime() - 20 * HOUR);
    const facts = base({ freeThrottle: { count: 3, oldestInWindow: oldest } });

    expect(decide(facts)).toEqual({
      kind: 'denial',
      reason: 'THROTTLED',
      resetsAt: new Date(oldest.getTime() + 24 * HOUR),
    });
  });

  it('grants the third download in the window', () => {
    const facts = base({
      freeThrottle: { count: 2, oldestInWindow: new Date(NOW.getTime() - HOUR) },
    });

    expect(decide(facts)).toMatchObject({ kind: 'grant', mode: 'free' });
  });

  it('checks the lifetime cap before the throttle', () => {
    const facts = base({
      lifetime: { distinctReleases: 5, includesThisRelease: false },
      freeThrottle: { count: 3, oldestInWindow: NOW },
    });

    expect(decide(facts)).toMatchObject({ reason: 'LIFETIME_CAP' });
  });
});

describe('decide — entitled', () => {
  const entitled = (overrides: Partial<DownloadFacts> = {}): DownloadFacts =>
    base({
      entitled: true,
      purchaseThrottle: { count: 0, lastDownloadedAt: null },
      ...overrides,
    });

  it('grants purchased mode for any format, charging only the purchase throttle', () => {
    expect(decide(entitled({ requested: ['FLAC', 'AAC'] }))).toEqual({
      kind: 'grant',
      mode: 'purchased',
      formats: [flac, aac],
      charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
    });
  });

  it('keeps an entitled subject on the purchase path even for free-only formats', () => {
    expect(decide(entitled({ requested: ['MP3_320KBPS'] }))).toMatchObject({ mode: 'purchased' });
  });

  it('still delivers a withdrawn format to an entitled subject', () => {
    const facts = entitled({ requested: ['AAC'], available: [mp3, withdrawnAac] });

    expect(decide(facts)).toMatchObject({ kind: 'grant', formats: [withdrawnAac] });
  });

  it('ignores the lifetime cap and the free throttle', () => {
    const facts = entitled({
      lifetime: { distinctReleases: 5, includesThisRelease: false },
      freeThrottle: { count: 3, oldestInWindow: NOW },
    });

    expect(decide(facts)).toMatchObject({ kind: 'grant', mode: 'purchased' });
  });

  it('denies DOWNLOAD_LIMIT at five downloads inside the idle window, with hours to reset', () => {
    const facts = entitled({
      purchaseThrottle: { count: 5, lastDownloadedAt: new Date(NOW.getTime() - 2 * HOUR) },
    });

    expect(decide(facts)).toEqual({ kind: 'denial', reason: 'DOWNLOAD_LIMIT', resetInHours: 4 });
  });

  it('grants again once six idle hours have passed', () => {
    const facts = entitled({
      purchaseThrottle: { count: 5, lastDownloadedAt: new Date(NOW.getTime() - 6 * HOUR) },
    });

    expect(decide(facts)).toMatchObject({ kind: 'grant', mode: 'purchased' });
  });
});
