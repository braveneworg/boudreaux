/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where an admin grants and removes the manager role, at
 * `/admin/community/managers`. It shares the approver section's shell, which a
 * manager reaches, so the page asks for admin access itself.
 */
import { UserCog } from 'lucide-react';

import { ManagerControls } from '@/app/components/community/manager-controls';
import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireApprover } from '@/lib/community/community-session';
import { ManagerService } from '@/lib/services/manager-service';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Managers' };

export const dynamic = 'force-dynamic';

const BREADCRUMBS = [
  { anchorText: 'Community', url: '/admin/community', isActive: false },
  { anchorText: 'Managers', url: '/admin/community/managers', isActive: true },
];

export default async function ManagersPage() {
  await requireApprover('admin');
  const managers = await ManagerService.list();

  return (
    <ZinePanel accent="kraft" tape={false} contentClassName="space-y-6" breadcrumbs={BREADCRUMBS}>
      <SectionHeader
        icon={UserCog}
        title="Managers"
        helpText="A manager can approve and reject submissions and reaches nothing else in the admin area. A manager cannot decide on their own submission. Granting or removing the role takes effect on that person's next page load."
      />
      <ManagerControls managers={managers} />
    </ZinePanel>
  );
}
