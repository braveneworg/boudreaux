/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { approveSubmissionAction, rejectSubmissionAction } from '@/lib/actions/submission-actions';
import { REJECTION_REASON_MAX, REJECTION_REASON_MIN } from '@/lib/constants/submissions';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { SavedSubmission, SubmissionActionResult } from '@/lib/types/domain/submission';

export interface SubmissionDecisionPanelProps {
  submissionId: string;
  status: SubmissionStatus;
  /** The submission's `updatedAt` when this page loaded it, as an ISO datetime. */
  loadedUpdatedAt: string;
}

const QUEUE_PATH = '/admin/community';
const REASON_TOO_SHORT = `Give a reason of at least ${REJECTION_REASON_MIN} characters`;

interface RejectDialogProps {
  open: boolean;
  isDeciding: boolean;
  /** A refusal of the reason itself, shown under the field. */
  error: string;
  onOpenChange: (open: boolean) => void;
  onReject: (reason: string) => void;
}

/** Asks for the reason the owner will read. A rejection is never sent without one. */
const RejectDialog = ({ open, isDeciding, error, onOpenChange, onReject }: RejectDialogProps) => {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const shownError = localError || error;

  const handleReject = (): void => {
    const trimmed = reason.trim();
    if (trimmed.length < REJECTION_REASON_MIN) {
      setLocalError(REASON_TOO_SHORT);
      return;
    }

    setLocalError('');
    onReject(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this submission</DialogTitle>
          <DialogDescription>
            It goes offline at once. Its owner is emailed the reason and can edit it and publish
            again.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={reasonId}>Reason, shown to the owner</Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={REJECTION_REASON_MAX}
            rows={4}
            aria-invalid={shownError !== ''}
            onChange={(event) => {
              setReason(event.target.value);
              setLocalError('');
            }}
          />
          {shownError !== '' && (
            <p role="alert" className="text-destructive text-sm">
              {shownError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeciding} onClick={handleReject}>
            Reject and tell the owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * An approver's decision on the submission shown above it: approve one that
 * is awaiting approval, or reject one that is awaiting approval or already
 * approved. Each decision carries the moment this page loaded the submission,
 * so it is refused when the owner has changed it since; the page then reloads
 * to show what is there now.
 */
export const SubmissionDecisionPanel = ({
  submissionId,
  status,
  loadedUpdatedAt,
}: SubmissionDecisionPanelProps) => {
  const router = useRouter();
  const [isDeciding, setIsDeciding] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonError, setReasonError] = useState('');

  /** Whether the decision went through; a failure is reported here. */
  const settle = (result: SubmissionActionResult<SavedSubmission>, done: string): boolean => {
    setIsDeciding(false);
    if (result.success) {
      toast.success(done);
      router.push(QUEUE_PATH);
      return true;
    }

    const [reasonRefusal] = result.fieldErrors?.reason ?? [];
    if (reasonRefusal !== undefined) {
      setReasonError(reasonRefusal);
      return false;
    }

    toast.error(result.error);
    // The owner changed it after this page loaded: show what is there now.
    if (result.code === 'DUPLICATE') {
      setRejectOpen(false);
      router.refresh();
    }
    return false;
  };

  const approve = async (): Promise<void> => {
    setIsDeciding(true);
    settle(
      await approveSubmissionAction({ submissionId, loadedUpdatedAt }),
      'Approved. Its owner has been told.'
    );
  };

  const reject = async (reason: string): Promise<void> => {
    setIsDeciding(true);
    setReasonError('');
    settle(
      await rejectSubmissionAction({ submissionId, loadedUpdatedAt, reason }),
      'Rejected. Its owner has been told why.'
    );
  };

  if (status === 'REJECTED') {
    return (
      <p className="mt-8 border-t pt-6 text-sm">
        Rejected. It returns here if its owner edits it and publishes again.
      </p>
    );
  }

  if (status === 'DRAFT') {
    return null;
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
      {status === 'AWAITING_APPROVAL' && (
        <Button type="button" disabled={isDeciding} onClick={approve}>
          Approve
        </Button>
      )}
      <Button
        type="button"
        variant="destructive"
        disabled={isDeciding}
        onClick={() => setRejectOpen(true)}
      >
        Reject
      </Button>
      <RejectDialog
        open={rejectOpen}
        isDeciding={isDeciding}
        error={reasonError}
        onOpenChange={setRejectOpen}
        onReject={reject}
      />
    </div>
  );
};
