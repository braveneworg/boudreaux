/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DUPLICATE_SLUG, type FailureFieldTable } from './form-state-helpers';

/**
 * How the artist create and update actions put a service failure on the form.
 * An artist's only unique field besides its id is its slug
 * (prisma/schema.prisma), so a DUPLICATE marks the slug field; anything else
 * shows the service's own copy as a general error.
 */
export const ARTIST_WRITE_FAILURES: FailureFieldTable = {
  fields: new Map([['DUPLICATE', DUPLICATE_SLUG]]),
};
