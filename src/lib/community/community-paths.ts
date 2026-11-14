/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The community's public addresses (CONTEXT.md, "community page"), in one
 * client-safe place: cards, the search, breadcrumbs and the server's
 * revalidation all build them here.
 */

/** The community page. */
export const COMMUNITY_PATH = '/community';

/** The id of the full list on the community page: what "view all" scrolls to. */
export const ALL_SUBMISSIONS_ID = 'all-submissions';

/**
 * A submission's own page. Its address holds its id and nothing else, so no
 * edit or rename breaks a shared link.
 */
export const submissionPath = (id: string): string => `${COMMUNITY_PATH}/${id}`;

/**
 * One user's listed submissions: a filter on the community page, by their
 * current username. It breaks when they rename; a submission's own link
 * never does.
 */
export const userSubmissionsPath = (username: string): string =>
  `${COMMUNITY_PATH}?user=${encodeURIComponent(username)}`;

/** The first breadcrumb of every community page: the way back to the community page. */
export const COMMUNITY_CRUMB = { anchorText: 'Community', url: COMMUNITY_PATH, isActive: false };
