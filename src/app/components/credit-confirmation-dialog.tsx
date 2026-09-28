/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useId, useState } from 'react';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type {
  CreditAwaitingConfirmation,
  CreditConfirmation,
  CreditDecisions,
  CreditThatStaysHidden,
  HiddenCreditReason,
} from '@/lib/utils/credit-confirmation';

interface CreditConfirmationDialogProps {
  /** The credits to decide on; `null` keeps the dialog closed. */
  confirmation: CreditConfirmation | null;
  /** Label of the confirming button, e.g. "Publish release". */
  confirmLabel: string;
  /** Called with a decision for every credit awaiting confirmation. */
  onConfirm: (decisions: CreditDecisions) => void;
  /** Called when the admin backs out; nothing is published. */
  onCancel: () => void;
}

const GENERATED_ON = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

const bioLabel = ({ bioState, bioGeneratedAt }: CreditAwaitingConfirmation): string => {
  switch (bioState) {
    case 'none':
      return 'No bio';
    case 'hand-written':
      return 'Hand-written bio';
    case 'generated':
      return bioGeneratedAt
        ? `Generated bio (${GENERATED_ON.format(bioGeneratedAt)})`
        : 'Generated bio';
  }
};

const imagesLabel = (count: number): string =>
  count === 1 ? '1 display image' : `${count} display images`;

const reasonLabel = (reason: HiddenCreditReason): string => {
  switch (reason) {
    case 'deleted':
      return 'deleted';
    case 'no-departure-date':
      return 'inactive with no departure date';
  }
};

interface AwaitingCreditRowProps {
  credit: CreditAwaitingConfirmation;
  publish: boolean;
  onPublishChange: (artistId: string, publish: boolean) => void;
}

/** One artist awaiting a decision: what goes live, and the publish toggle. */
const AwaitingCreditRow = ({
  credit,
  publish,
  onPublishChange,
}: AwaitingCreditRowProps): React.JSX.Element => {
  const handleCheckedChange = useCallback(
    (checked: boolean) => onPublishChange(credit.id, checked),
    [credit.id, onPublishChange]
  );

  return (
    <li
      data-testid={`credit-${credit.id}`}
      className="flex items-start justify-between gap-3 border border-black p-3"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{credit.name}</p>
        <p className="text-sm text-zinc-700">
          {bioLabel(credit)} · {imagesLabel(credit.displayImageCount)}
        </p>
        <Link
          href={`/admin/artists/${credit.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Review ${credit.name}`}
          className="text-sm underline"
        >
          Review artist
        </Link>
      </div>
      <Switch
        checked={publish}
        onCheckedChange={handleCheckedChange}
        aria-label={`Publish ${credit.name}`}
      />
    </li>
  );
};

/** One credit that publishing cannot make public, with the reason. */
const HiddenCreditRow = ({ credit }: { credit: CreditThatStaysHidden }): React.JSX.Element => (
  <li data-testid={`hidden-${credit.id}`} className="text-sm text-zinc-700">
    {credit.name} — {reasonLabel(credit.reason)}
  </li>
);

interface CreditConfirmationBodyProps extends Omit<CreditConfirmationDialogProps, 'confirmation'> {
  confirmation: CreditConfirmation;
}

/**
 * The dialog's content. Mounted only while the dialog is open, so the toggles
 * start from "keep hidden" for every release.
 */
const CreditConfirmationBody = ({
  confirmation: { awaiting, stayHidden },
  confirmLabel,
  onConfirm,
  onCancel,
}: CreditConfirmationBodyProps): React.JSX.Element => {
  const [publishIds, setPublishIds] = useState<ReadonlySet<string>>(new Set());
  const hiddenHeadingId = useId();

  const handlePublishChange = useCallback((artistId: string, publish: boolean) => {
    setPublishIds((current) => {
      const next = new Set(current);
      if (publish) {
        next.add(artistId);
      } else {
        next.delete(artistId);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const ids = awaiting.map(({ id }) => id);
    onConfirm({
      publishArtistIds: ids.filter((id) => publishIds.has(id)),
      keepHiddenArtistIds: ids.filter((id) => !publishIds.has(id)),
    });
  }, [awaiting, publishIds, onConfirm]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Credited artists</DialogTitle>
        <DialogDescription>
          These artists are not public yet. Publishing an artist makes its page, bio and images
          public. An artist you keep hidden stays off the site, and the release shows without that
          name.
        </DialogDescription>
      </DialogHeader>

      {awaiting.length > 0 && (
        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {awaiting.map((credit) => (
            <AwaitingCreditRow
              key={credit.id}
              credit={credit}
              publish={publishIds.has(credit.id)}
              onPublishChange={handlePublishChange}
            />
          ))}
        </ul>
      )}

      {stayHidden.length > 0 && (
        <section aria-labelledby={hiddenHeadingId}>
          <h3 id={hiddenHeadingId} className="text-sm font-semibold">
            Will not be shown
          </h3>
          <ul>
            {stayHidden.map((credit) => (
              <HiddenCreditRow key={credit.id} credit={credit} />
            ))}
          </ul>
        </section>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
};

/**
 * Asks an admin to decide each credited artist before a release is published
 * (ADR-0015). Every artist awaiting confirmation is either published with the
 * release or kept hidden; nothing is published by omission. Each row shows
 * what would go live with the artist. Credits that publishing cannot make
 * public are listed with the reason and cannot be changed here.
 */
export const CreditConfirmationDialog = ({
  confirmation,
  confirmLabel,
  onConfirm,
  onCancel,
}: CreditConfirmationDialogProps): React.JSX.Element => {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <Dialog open={confirmation !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-md">
        {confirmation && (
          <CreditConfirmationBody
            confirmation={confirmation}
            confirmLabel={confirmLabel}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
