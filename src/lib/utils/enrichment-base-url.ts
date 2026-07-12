/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

/**
 * Resolve the app's canonical public origin (`NEXT_PUBLIC_BASE_URL` — the same
 * env every publicly-reachable absolute link uses, e.g. email/notification
 * URLs), with any trailing slash trimmed so appended paths have exactly one
 * separator. Returns `null` when the base URL is unconfigured, so callers can
 * fail an async job rather than dispatch an un-answerable invoke (fake/E2E
 * paths never reach it). Both the bio and video enrichment pipelines derive
 * their callback/progress URLs from this base.
 */
export const resolveEnrichmentBaseUrl = (): string | null => {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return base ? base.replace(/\/$/, '') : null;
};
