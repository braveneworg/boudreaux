/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useId } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PublishedWorkCreditedTo } from '@/lib/utils/credit-confirmation';

interface HidingWarningDialogProps {
  /** The public work that carries the artist's name; `null` keeps the dialog closed. */
  work: PublishedWorkCreditedTo | null;
  /** Called when the admin goes ahead and hides the artist. */
  onConfirm: () => void;
  /** Called when the admin backs out; the artist stays as it is. */
  onCancel: () => void;
}

const SHOW_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

interface WorkSectionProps {
  heading: string;
  children: React.ReactNode;
}

const WorkSection = ({ heading, children }: WorkSectionProps): React.JSX.Element => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold">
        {heading}
      </h3>
      <ul className="max-h-[25vh] overflow-y-auto text-sm text-zinc-700">{children}</ul>
    </section>
  );
};

/**
 * Warns an admin, before an artist is archived or deleted, which public work
 * will lose the artist's name: the published releases that credit the artist
 * and the tour dates the artist headlines (ADR-0015). The work itself stays
 * public. Hiding is never blocked; this only makes the consequence known.
 */
export const HidingWarningDialog = ({
  work,
  onConfirm,
  onCancel,
}: HidingWarningDialogProps): React.JSX.Element => {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    },
    [onCancel]
  );

  // Called with no argument: the click event is not the caller's business.
  const handleConfirm = useCallback(() => onConfirm(), [onConfirm]);
  const handleCancel = useCallback(() => onCancel(), [onCancel]);

  return (
    <Dialog open={work !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>This artist is credited on public work</DialogTitle>
          <DialogDescription>
            Hiding the artist removes the name from the releases and tour dates below. They stay
            public, without this artist’s name.
          </DialogDescription>
        </DialogHeader>

        {work && work.releases.length > 0 && (
          <WorkSection heading="Releases">
            {work.releases.map(({ id, title }) => (
              <li key={id} data-testid={`hidden-release-${id}`}>
                {title}
              </li>
            ))}
          </WorkSection>
        )}

        {work && work.tourDates.length > 0 && (
          <WorkSection heading="Tour dates">
            {work.tourDates.map(({ id, tourTitle, startDate }) => (
              <li key={id} data-testid={`hidden-tour-date-${id}`}>
                {tourTitle} — {SHOW_DATE.format(startDate)}
              </li>
            ))}
          </WorkSection>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Hide artist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
