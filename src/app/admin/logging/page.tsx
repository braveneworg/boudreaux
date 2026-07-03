/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ScrollText } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { getLogLevelState } from '@/lib/utils/logger';

import { LogLevelForm } from './log-level-form';

export const dynamic = 'force-dynamic';

export default function LoggingPage() {
  const state = getLogLevelState();

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Logging', url: '/admin/logging', isActive: true },
      ]}
    >
      <SectionHeader
        icon={ScrollText}
        title="Logging"
        helpText="Override the server log level at runtime — e.g. enable debug logging during an incident. Overrides revert when their duration elapses, and always reset on deploy or container restart."
      />

      <LogLevelForm initialState={state} />
    </ZinePanel>
  );
}
