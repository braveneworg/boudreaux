/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const SubscribeSuccessLoading = () => (
  <div className="mx-auto max-w-2xl px-4 py-16 text-center">
    <div
      className="border-muted-foreground mx-auto h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
      role="status"
      aria-label="Loading"
    />
    <p className="text-muted-foreground mt-6 text-lg">Confirming your subscription…</p>
  </div>
);

export default SubscribeSuccessLoading;
