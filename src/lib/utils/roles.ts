/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CONSTANTS } from '@/lib/constants';

/**
 * What a role admits, in one client-safe place: the action gate, the admin
 * layout and the navigation all ask here, so the server and the menu never
 * disagree about who an approver is.
 */

/** Whether a role is the admin role. */
export const isAdminRole = (role: string | null | undefined): boolean =>
  role === CONSTANTS.ROLES.ADMIN;

/**
 * Whether a role may approve submissions: an admin, or a manager, who is an
 * approver and nothing more (ADR-0025).
 */
export const isApproverRole = (role: string | null | undefined): boolean =>
  role === CONSTANTS.ROLES.ADMIN || role === CONSTANTS.ROLES.MANAGER;
