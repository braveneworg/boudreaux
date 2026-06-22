/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Barrel for the hand-written, Prisma-free domain types. Layers above the
 * repository import from here (or the per-entity files) instead of from Prisma.
 * Per-entity modules are added as each chain is migrated off Prisma.
 */
export * from './shared';
export * from './errors';
