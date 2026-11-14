/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import nextDynamic from 'next/dynamic';

import { Flag } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';

// Interaction-only: the form library, the schema and the verification script
// load when Report is first pressed, never with the page. The dialog draws
// itself once it has loaded, so there is nothing to hold a place for.
const SubmissionReportDialog = nextDynamic(
  () =>
    import('./submission-report-dialog').then((mod) => ({
      default: mod.SubmissionReportDialog,
    })),
  { ssr: false, loading: () => null }
);

export interface SubmissionReportControlProps {
  submissionId: string;
  /** The submission's title as its page shows it. */
  title: string;
}

/**
 * The Report button on a public submission's page, and the dialog it opens
 * (ADR-0025, ADR-0028). Anyone who can open the page may press it; no account
 * is needed.
 *
 * Each press opens a new dialog, so a reporter who comes back to it after
 * sending or cancelling starts from an empty form. The button cannot be
 * pressed until the page has hydrated: before that a press would do nothing,
 * and a button that looks ready and is not is worse than one that waits.
 */
export const SubmissionReportControl = ({ submissionId, title }: SubmissionReportControlProps) => {
  /** How many times the dialog has been opened; it also keys the dialog. */
  const [opens, setOpens] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const isHydrated = useHydrated();

  const open = (): void => {
    setOpens((count) => count + 1);
    setIsOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        disabled={!isHydrated}
        onClick={open}
      >
        <Flag aria-hidden="true" />
        Report
      </Button>
      {opens > 0 && (
        <SubmissionReportDialog
          key={opens}
          submissionId={submissionId}
          title={title}
          open={isOpen}
          onOpenChange={setIsOpen}
        />
      )}
    </>
  );
};
