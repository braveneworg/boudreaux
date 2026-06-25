/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { DownloadIcon, LogInIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';

interface ReturningDownloadStepProps {
  releaseTitle: string;
  guestAtCap: boolean;
  guestResetInHours: number | null;
}

export const ReturningDownloadStep = ({
  releaseTitle,
  guestAtCap,
  guestResetInHours,
}: ReturningDownloadStepProps): React.ReactElement => (
  <>
    <DialogHeader>
      <DialogTitle>Welcome Back!</DialogTitle>
      <DialogDescription>
        You&apos;ve already purchased <strong>{releaseTitle}</strong>.
      </DialogDescription>
    </DialogHeader>
    {guestAtCap ? (
      <>
        <Button className="w-full" disabled>
          <DownloadIcon className="size-4" />
          Download limit reached
        </Button>
        <p className="text-sm text-zinc-950">
          You&apos;ve reached your download limit for <strong>{releaseTitle}</strong>.
          {guestResetInHours !== null
            ? ` Resets in ${guestResetInHours} hour${guestResetInHours === 1 ? '' : 's'}.`
            : ''}
        </p>
      </>
    ) : (
      <>
        <Button asChild className="w-full">
          <Link href="/signin">
            <LogInIcon className="size-4" />
            Sign in to access your downloads
          </Link>
        </Button>
      </>
    )}
  </>
);
