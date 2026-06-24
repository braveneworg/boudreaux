/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { EmailStep } from '@/app/components/email-step';
import { FreeFormatSelectStep } from '@/app/components/free-format-select-step';
import { PurchaseCheckoutStep } from '@/app/components/purchase-checkout-step';
import { PurchaseSuccessStep } from '@/app/components/purchase-success-step';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { cn } from '@/lib/utils/tailwind-utils';

import { DownloadStep } from './download-step';
import { FormatSelectStep } from './format-select-step';
import { PurchaseConfirmedStep } from './purchase-confirmed-step';
import { ReturningDownloadStep } from './returning-download-step';
import { useDownloadDialogState } from './use-download-dialog-state';

import type { UseDownloadDialogStateReturn } from './use-download-dialog-state';

interface AvailableFormat {
  formatType: DigitalFormatType;
  fileName: string;
}

interface DownloadDialogProps {
  artistName: string;
  premiumPrice?: number;
  releaseId: string;
  releaseTitle?: string;
  suggestedPrice?: number | null;
  hasPurchase?: boolean;
  purchasedAt?: Date | null;
  downloadCount?: number;
  /** Hours until the per-release download limit resets. null when no reset is pending. */
  resetInHours?: number | null;
  availableFormats?: AvailableFormat[];
  openOnMount?: boolean;
  children: ReactElement;
}

/** The dialog props with every optional defaulted — shared by the hook call and the step router. */
interface ResolvedDialogProps {
  artistName: string;
  releaseId: string;
  releaseTitle: string;
  hasPurchase: boolean;
  purchasedAt: Date | null;
  downloadCount: number;
  resetInHours: number | null;
  availableFormats: AvailableFormat[];
}

/** Apply the dialog's default prop values once so the component body stays branch-free. */
const resolveDialogProps = (props: DownloadDialogProps): ResolvedDialogProps => ({
  artistName: props.artistName,
  releaseId: props.releaseId,
  releaseTitle: props.releaseTitle ?? '',
  hasPurchase: props.hasPurchase ?? false,
  purchasedAt: props.purchasedAt ?? null,
  downloadCount: props.downloadCount ?? 0,
  resetInHours: props.resetInHours ?? null,
  availableFormats: props.availableFormats ?? [],
});

/** Screen-reader dialog title — release-specific once purchased, otherwise artist-scoped. */
const dialogTitleFor = (resolved: ResolvedDialogProps): string =>
  resolved.hasPurchase
    ? `Download ${resolved.releaseTitle}`
    : `Download ${resolved.artistName}'s music`;

/**
 * Render the content for the dialog's active step. Centralising the per-step
 * routing here keeps the `DownloadDialog` component body free of the eight
 * `step === …` branches (and the email/checkout decision logic, which now lives
 * in {@link useDownloadDialogState}). Returns `null` for the unreachable default.
 */
const renderDialogStep = (
  state: UseDownloadDialogStateReturn,
  resolved: ResolvedDialogProps
): ReactElement | null => {
  const { artistName, releaseId, releaseTitle, hasPurchase, purchasedAt } = resolved;
  const { downloadCount, resetInHours, availableFormats } = resolved;

  switch (state.step) {
    case 'purchase-confirmed':
      return (
        <PurchaseConfirmedStep
          releaseTitle={releaseTitle}
          purchasedAt={purchasedAt}
          downloadCount={downloadCount}
          resetInHours={resetInHours}
          onContinue={() => state.setStep('format-select')}
        />
      );
    case 'download':
      return (
        <DownloadStep
          hasPurchase={hasPurchase}
          session={state.session}
          purchasedAt={purchasedAt}
          downloadCount={downloadCount}
          resetInHours={resetInHours}
          releaseTitle={releaseTitle}
          purchaseError={state.purchaseError}
          form={state.form}
          selectedOption={state.selectedOption}
          effectiveSuggestedPrice={state.effectiveSuggestedPrice}
          displayAmount={state.displayAmount}
          freeRadioDisabled={state.freeRadioDisabled}
          onSubmit={state.handleSubmit}
          onContinueToFormatSelect={() => state.setStep('format-select')}
          artistName={artistName}
        />
      );
    case 'format-select':
      return (
        <FormatSelectStep
          releaseId={releaseId}
          releaseTitle={releaseTitle}
          hasPurchase={hasPurchase}
          purchasedAt={purchasedAt}
          downloadCount={downloadCount}
          resetInHours={resetInHours}
          availableFormats={availableFormats}
          onDownloadComplete={state.handleDialogDownloadComplete}
        />
      );
    case 'free-format-select':
      return (
        <>
          <DialogHeader>
            <DialogTitle>Free Download</DialogTitle>
            <DialogDescription>
              Choose your free formats for <strong>{releaseTitle}</strong>
            </DialogDescription>
          </DialogHeader>

          <FreeFormatSelectStep
            releaseId={releaseId}
            availableFreeFormats={state.availableFreeFormats}
            isLoading={state.isFreeStatusPending}
            capReachedResetsAtIso={state.freeCapResetsAtIso}
            onDownloadComplete={state.handleDialogDownloadComplete}
          />

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => state.setStep('download')}
          >
            Back
          </Button>
        </>
      );
    case 'email-step':
      return (
        <EmailStep
          onCancel={() => state.setStep('download')}
          onConfirm={state.handleEmailConfirm}
        />
      );
    case 'purchase-checkout':
      return (
        <PurchaseCheckoutStep
          releaseId={releaseId}
          releaseTitle={releaseTitle}
          amountCents={state.amountCents}
          customerEmail={state.checkoutEmail}
          onConfirmed={() => state.setStep('purchase-success')}
          onCancel={() => state.setStep('download')}
          onError={state.handlePurchaseError}
        />
      );
    case 'purchase-success':
      return (
        <PurchaseSuccessStep
          releaseId={releaseId}
          releaseTitle={releaseTitle}
          availableFormats={availableFormats}
          downloadCount={downloadCount}
          onDownloadComplete={state.handleDialogDownloadComplete}
        />
      );
    case 'returning-download':
      return (
        <ReturningDownloadStep
          releaseTitle={releaseTitle}
          guestAtCap={state.guestAtCap}
          guestResetInHours={state.guestResetInHours}
        />
      );
    /* v8 ignore next 2 -- exhaustive switch: `step` is a closed union, so the default is unreachable */
    default:
      return null;
  }
};

export const DownloadDialog = (props: DownloadDialogProps): ReactElement => {
  const resolved = resolveDialogProps(props);
  const state = useDownloadDialogState(props);

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent
        className={cn(
          'sm:max-w-md',
          state.step === 'purchase-checkout' && 'max-h-[90vh] overflow-y-auto sm:max-w-lg'
        )}
        /* v8 ignore start -- Radix UI callback: not invocable from userEvent without real Radix focus management */
        onOpenAutoFocus={(e) => {
          if (state.step === 'purchase-checkout') e.preventDefault();
        }}
        /* v8 ignore stop */
      >
        <DialogTitle className="sr-only">{dialogTitleFor(resolved)}</DialogTitle>

        {renderDialogStep(state, resolved)}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Re-export DownloadTriggerButton from its standalone module for backward compatibility.
 */
export { DownloadTriggerButton } from './download-trigger-button';
