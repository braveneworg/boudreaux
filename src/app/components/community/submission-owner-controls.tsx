/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState, useTransition } from 'react';

import Link from 'next/link';

import { toast } from 'sonner';

import { EntityDeleteButton } from '@/app/components/forms/entity-delete-button';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import {
  deleteSubmissionAction,
  setSubmissionListedAction,
} from '@/lib/actions/submission-actions';
import type { SubmissionStatus } from '@/lib/constants/submissions';

export interface SubmissionOwnerControlsProps {
  submissionId: string;
  status: SubmissionStatus;
  listed: boolean;
}

export const LISTED_LABEL = 'Show on the User Submitted Content page';
export const LISTED_HELP = 'Off: only people with the link can open it.';

/**
 * What a submission's owner can do from its page: edit it, switch an approved
 * one between listed and unlisted, and delete it. The switch is offered only
 * on an approved submission, where it changes where the submission appears and
 * never whether it is reachable, so it needs no second approval.
 */
export const SubmissionOwnerControls = ({
  submissionId,
  status,
  listed,
}: SubmissionOwnerControlsProps) => {
  const switchId = useId();
  const [isListed, setIsListed] = useState(listed);
  const [isPending, startTransition] = useTransition();

  const handleListedChange = (next: boolean): void => {
    setIsListed(next);
    startTransition(async () => {
      const result = await setSubmissionListedAction({ submissionId, listed: next });
      if (result.success) {
        toast.success(next ? 'Listed.' : 'Unlisted. Only people with the link can open it.');
        return;
      }

      setIsListed(!next);
      toast.error(result.error);
    });
  };

  return (
    <div className="mt-8 space-y-4 border-t pt-6">
      {status === 'APPROVED' && (
        <div>
          <div className="flex items-center gap-3">
            <Switch
              id={switchId}
              checked={isListed}
              disabled={isPending}
              onCheckedChange={handleListedChange}
            />
            <Label htmlFor={switchId} className="cursor-pointer text-sm font-normal">
              {LISTED_LABEL}
            </Label>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{LISTED_HELP}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/community/${submissionId}/edit`}>Edit</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/community/mine">Your submissions</Link>
        </Button>
        <EntityDeleteButton
          onDelete={() => deleteSubmissionAction({ submissionId })}
          label="Delete"
          title="Delete this submission?"
          description="It is removed for good, along with its link. This cannot be undone."
          successMessage="Submission deleted."
          failureMessage="We could not delete your submission. Please try again."
          redirectTo="/community/mine"
        />
      </div>
    </div>
  );
};
