/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { markSubmissionReportHandledAction } from '@/lib/actions/submission-report-actions';

interface SubmissionReportHandleButtonProps {
  reportId: string;
}

/**
 * Marks one open report handled, as the approver who pressed (ADR-0028). It
 * changes the report and nothing else: the submission stays as it is. The
 * list reloads afterwards to show who handled it and when. The button cannot
 * be pressed until the page has hydrated, since a press before that is lost.
 */
export const SubmissionReportHandleButton = ({ reportId }: SubmissionReportHandleButtonProps) => {
  const router = useRouter();
  const [isMarking, setIsMarking] = useState(false);
  const isHydrated = useHydrated();

  const markHandled = async (): Promise<void> => {
    setIsMarking(true);
    const result = await markSubmissionReportHandledAction({ reportId });
    setIsMarking(false);

    if (result.success) {
      toast.success('Marked handled.');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!isHydrated || isMarking}
      onClick={markHandled}
    >
      Mark handled
    </Button>
  );
};
