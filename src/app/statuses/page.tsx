/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import CDNStatusBanner from '../components/cdn-status-banner';
import DataStoreHealthStatus from '../components/data-store-health-status';

export default function Statuses() {
  return (
    <>
      <DataStoreHealthStatus />
      <CDNStatusBanner />
    </>
  );
}
