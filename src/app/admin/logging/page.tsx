/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Heading } from '@/app/components/ui/heading';
import { getLogLevelState } from '@/lib/utils/logger';

import { LogLevelForm } from './log-level-form';

export const dynamic = 'force-dynamic';

export default function LoggingPage() {
  const state = getLogLevelState();

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Logging', url: '/admin/logging', isActive: true },
        ]}
      />

      <div className="mt-4 mb-4">
        <Heading level={1} className="h-auto">
          Logging
        </Heading>
      </div>

      <p className="text-zinc-950-foreground mb-4 px-6">
        Override the server log level at runtime — for example, enable debug logging while
        investigating an incident. Overrides revert automatically when their duration elapses, and
        always reset on deploy or container restart.
      </p>

      <LogLevelForm initialState={state} />
    </div>
  );
}
