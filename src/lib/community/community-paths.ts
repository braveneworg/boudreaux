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

/** The query parameter of a submission deep link: the id of the submission to open. */
export const SUBMISSION_PARAM = 'submission';

/**
 * A submission's permalink, the submission deep link (ADR-0030): the
 * community page with the submission open over it. A submission is never a
 * page of its own. The address holds its id and nothing else, so no edit or
 * rename breaks a shared link.
 */
export const submissionDeepLink = (id: string): string =>
  `${COMMUNITY_PATH}?${SUBMISSION_PARAM}=${encodeURIComponent(id)}`;

/**
 * The route that answers one submission as its reader may see it: what the
 * submission modal reads when it opens.
 */
export const submissionReadPath = (id: string): string =>
  `/api/community/submissions/${encodeURIComponent(id)}`;

/**
 * The route the submission modal posts to once it has opened a submission
 * in a browser, to ask for the opening to be counted as a view (ADR-0029).
 * Under `/api`, where the guest's visitor cookie is sent.
 */
export const submissionViewPath = (id: string): string => `/api/community/submissions/${id}/view`;

/**
 * One user's listed submissions: a filter on the community page, by their
 * current username. It breaks when they rename; a submission's own link
 * never does.
 */
export const userSubmissionsPath = (username: string): string =>
  `${COMMUNITY_PATH}?user=${encodeURIComponent(username)}`;

/** The first breadcrumb of every community page: the way back to the community page. */
export const COMMUNITY_CRUMB = { anchorText: 'Community', url: COMMUNITY_PATH, isActive: false };
