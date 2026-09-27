/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the admin reads when a Server Action call fails because the open tab
 * predates the deployed build. Reloading picks up the new action ids.
 */
export const STALE_PAGE_MESSAGE =
  'This page is out of date after a deploy. Reload the page and try again.';

/**
 * Next.js hashes every Server Action per build, and every merge here deploys
 * a new build. A tab left open across a deploy sends an action id the new
 * server never had, and Next throws `UnrecognizedActionError` — "Server
 * Action "<id>" was not found on the server". The name is checked first; the
 * message is a fallback for builds that surface it as a plain `Error`.
 */
const STALE_ACTION_MESSAGE = /Server Action "[^"]*" was not found on the server/;

/** The two fields Next.js sets on the thrown error, read without trusting the shape. */
const readNameAndMessage = (error: unknown): { name: string; message: string } => {
  if (typeof error !== 'object' || error === null) return { name: '', message: '' };
  const { name, message } = error as { name?: unknown; message?: unknown };
  return {
    name: typeof name === 'string' ? name : '',
    message: typeof message === 'string' ? message : '',
  };
};

/** True when `error` is Next.js rejecting an action id from an older build. */
export const isStaleServerActionError = (error: unknown): boolean => {
  const { name, message } = readNameAndMessage(error);
  return name === 'UnrecognizedActionError' || STALE_ACTION_MESSAGE.test(message);
};
