/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';

interface PurchaseSuccessStepProps {
  releaseId: string;
  releaseTitle: string;
}

/**
 * Final step shown after a PWYW purchase is confirmed.
 * Displays a download link and confirmation messaging.
 */
export const PurchaseSuccessStep = ({ releaseId, releaseTitle }: PurchaseSuccessStepProps) => {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Purchase Complete!</DialogTitle>
        <DialogDescription>Your payment for {releaseTitle} was confirmed.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Button asChild variant="default" className="w-full">
          <Link href={`/api/releases/${releaseId}/download`}>
            <DownloadIcon className="size-4" />
            Download Now
          </Link>
        </Button>

        <p className="text-muted-foreground text-sm">
          A confirmation email with your download link is on its way.
        </p>

        <p className="text-muted-foreground text-sm">
          You can download up to {MAX_RELEASE_DOWNLOAD_COUNT} times.
        </p>
      </div>
    </>
  );
};
