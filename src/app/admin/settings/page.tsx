/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Settings } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { SectionHeader } from '@/app/components/ui/section-header';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';

import { SignupsPausedToggle } from './signups-paused-toggle';

export const dynamic = 'force-dynamic';

const AdminSettingsPage = async (): Promise<React.JSX.Element> => {
  const [paused, envForced] = await Promise.all([
    SignupSettingsService.areSignupsPaused(),
    Promise.resolve(SignupSettingsService.isEnvForced()),
  ]);

  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Settings', url: '/admin/settings', isActive: true },
        ]}
      />

      <SectionHeader
        icon={Settings}
        title="Settings"
        helpText="Manage site-wide settings. Changes take effect immediately."
      />

      <div className="space-y-6">
        <div className="rounded-lg border p-6">
          <h2 className="mb-1 text-sm font-semibold">Signups</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Pause or resume new account creation. Existing users can always sign in.
          </p>
          <SignupsPausedToggle paused={paused} envForced={envForced} />
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
