/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import 'server-only';

import { cookies } from 'next/headers';

/**
 * Guest Visitor ID Cookie
 *
 * Stable, opaque identifier (UUID v4 from Web Crypto) issued to anonymous
 * visitors who initiate a free download. Used to key:
 *  - `GuestDownloadCount` (per-release download cap)
 *  - `UserDownloadQuota.visitorId` (freemium AAC quota)
 *  - `DownloadEvent.visitorId` (audit log)
 *
 * The cookie is HTTP-only, SameSite=Lax, and (in production) Secure. The path
 * is scoped to `/api` rather than `/` so the cookie is not transmitted on
 * page navigations, but is available to both
 * `/api/releases/[id]/download/bundle` and `/api/free-quota/status`.
 *
 * Feature: 007-free-digital-downloads
 */

export const VISITOR_ID_COOKIE = 'boudreaux_visitor_id';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Permissive RFC 4122 UUID regex (any version 1-7).
 * Accepts the value previously issued by this util as well as any
 * future UUID version we might switch to.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns the visitor's existing `boudreaux_visitor_id` cookie value if it is
 * present and well-formed; otherwise issues a fresh UUID, sets the cookie on
 * the outgoing response, and returns the new value.
 *
 * Must be called from a Next.js Route Handler or Server Action (the
 * `cookies()` API mutates the response).
 */
export const getOrIssueGuestVisitorId = async (): Promise<string> => {
  const store = await cookies();
  const existing = store.get(VISITOR_ID_COOKIE)?.value;

  if (existing && UUID_REGEX.test(existing)) {
    return existing;
  }

  const value = crypto.randomUUID();
  store.set(VISITOR_ID_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: ONE_YEAR_SECONDS,
  });
  return value;
};

/**
 * Read the existing `boudreaux_visitor_id` cookie value if present and
 * well-formed, otherwise return `null`. Unlike {@link getOrIssueGuestVisitorId},
 * this never issues a new cookie — used by the free-download flow where
 * identity resolution decides whether to mint a UUID, recover one via
 * fingerprint, or adopt the cookie's existing value.
 *
 * Feature: 007-free-digital-downloads
 */
export const readGuestVisitorId = async (): Promise<string | null> => {
  const store = await cookies();
  const existing = store.get(VISITOR_ID_COOKIE)?.value;
  return existing && UUID_REGEX.test(existing) ? existing : null;
};

/**
 * Set the `boudreaux_visitor_id` cookie to the given canonical visitor id.
 * Used after the four-branch identity-resolution algorithm has decided the
 * client should be (re)issued the cookie (Branches 3 and 4 in research.md
 * §R-6). The cookie attributes match {@link getOrIssueGuestVisitorId}.
 *
 * Feature: 007-free-digital-downloads
 */
export const setGuestVisitorIdCookie = async (visitorId: string): Promise<void> => {
  const store = await cookies();
  store.set(VISITOR_ID_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: ONE_YEAR_SECONDS,
  });
};
