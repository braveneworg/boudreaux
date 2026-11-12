/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isApproverRole } from '@/lib/utils/roles';

/**
 * Whether a role may use the community feature at all: every `/community/*`
 * route and every submission Server Action asks here, on top of its own gate.
 *
 * Until the community page launches (stage 4 of ADR-0025's delivery), only
 * approvers may, so the approval loop can be tried in production without a
 * member of the public finding a half-built form. Launch changes this one
 * answer to admit every role; nothing else has to move.
 */
export const mayUseCommunity = (role: string | null | undefined): boolean => isApproverRole(role);
