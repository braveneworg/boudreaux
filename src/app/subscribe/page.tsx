/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Subscribe | Fake Four Inc.',
  description: 'Subscribe to access all music on the Fake Four Inc. record label.',
};

const SubscribePage = () => {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Subscribe</h1>
      <p className="text-zinc-950-foreground mt-4 text-lg">Subscribe form coming soon.</p>
    </div>
  );
};

export default SubscribePage;
