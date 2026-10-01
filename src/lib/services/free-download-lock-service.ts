/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

// Transitional: the download routes still take the lock themselves until they
// become gate adapters (ADR-0018). Deleted with that change.
export { inProcessDownloadLock as freeDownloadLockService } from './download-gate/lock';
