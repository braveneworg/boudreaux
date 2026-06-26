/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useTransition } from 'react';

import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { setSignupsPausedAction } from '@/lib/actions/set-signups-paused-action';

interface SignupsPausedToggleProps {
  paused: boolean;
  envForced: boolean;
}

export const SignupsPausedToggle = ({
  paused,
  envForced,
}: SignupsPausedToggleProps): React.JSX.Element => {
  const [isPending, startTransition] = useTransition();

  if (envForced) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch checked disabled aria-label="Pause new signups" />
          <span className="text-sm font-medium">Pause new signups</span>
        </div>
        <p className="text-muted-foreground text-sm">
          Forced on by AUTH_DISABLE_SIGNUP (env) — clear the env var to control this here.
        </p>
      </div>
    );
  }

  const handleCheckedChange = (checked: boolean) => {
    startTransition(async () => {
      const r = await setSignupsPausedAction({ paused: checked });
      if (r.success) {
        toast.success(checked ? 'Signups paused.' : 'Signups resumed.');
      } else {
        toast.error('Could not update signup settings.');
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        aria-label="Pause new signups"
        checked={paused}
        disabled={isPending}
        onCheckedChange={handleCheckedChange}
      />
      <span className="text-sm font-medium">Pause new signups</span>
    </div>
  );
};
