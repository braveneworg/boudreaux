/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { DownloadIcon, LogInIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { cn } from '@/lib/utils/tailwind-utils';
import { DOWNLOAD_OPTIONS, type DownloadFormSchemaType } from '@/lib/validation/download-schema';

import type { UseFormReturn } from 'react-hook-form';

interface PurchasedSignedInActionsProps {
  purchasedAt: Date | null;
  downloadCount: number;
  resetInHours: number | null;
  releaseTitle: string;
  onContinueToFormatSelect: () => void;
}

/**
 * Actions shown to a signed-in purchaser on the download step: their purchase
 * date plus either a disabled limit-reached button or the continue CTA.
 */
const PurchasedSignedInActions = ({
  purchasedAt,
  downloadCount,
  resetInHours,
  releaseTitle,
  onContinueToFormatSelect,
}: PurchasedSignedInActionsProps): React.ReactElement => (
  <>
    <p className="text-sm text-zinc-900">
      Purchased on{' '}
      <strong>
        {purchasedAt
          ? new Date(purchasedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'a previous date'}
      </strong>
      .
    </p>

    {downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT ? (
      <>
        <Button className="w-full" type="button" disabled>
          <DownloadIcon className="size-4" />
          Download limit reached
        </Button>
        <p className="text-sm text-zinc-950">
          You&apos;ve reached your download limit for <strong>{releaseTitle}</strong>.
          {resetInHours !== null
            ? ` Resets in ${resetInHours} hour${resetInHours === 1 ? '' : 's'}.`
            : ''}
        </p>
      </>
    ) : (
      <Button
        className="w-full"
        type="button"
        /* v8 ignore start -- dead onClick: the auto-advance effect moves a signed-in purchaser straight to 'format-select', so this download-step Continue button is never clicked */
        onClick={onContinueToFormatSelect}
        /* v8 ignore stop */
      >
        <DownloadIcon className="size-4" />
        Continue to Download
      </Button>
    )}
  </>
);

interface PurchaseDownloadFormProps {
  form: UseFormReturn<DownloadFormSchemaType>;
  selectedOption: string | undefined;
  effectiveSuggestedPrice: number;
  displayAmount: string;
  freeRadioDisabled: boolean;
  onSubmit: (data: DownloadFormSchemaType) => void;
  artistName: string;
}

/**
 * The pay-what-you-want download form: the option radio group, the conditional
 * custom-amount input (premium only), and the submit button.
 */
const PurchaseDownloadForm = ({
  form,
  selectedOption,
  effectiveSuggestedPrice,
  displayAmount,
  freeRadioDisabled,
  onSubmit,
  artistName,
}: PurchaseDownloadFormProps): React.ReactElement => (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Download option radio group */}
      <FormField
        control={form.control}
        name="downloadOption"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value ?? ''}
                className="gap-4"
              >
                {DOWNLOAD_OPTIONS.map((option) => {
                  const isFreeOption = option.value === 'free-320-aac';
                  const optionDisabled = isFreeOption && freeRadioDisabled;
                  return (
                    <FormItem key={option.value} className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem
                          className="size-6"
                          value={option.value}
                          disabled={optionDisabled}
                        />
                      </FormControl>
                      <FormLabel
                        className={cn(
                          'cursor-pointer font-normal',
                          optionDisabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="leading-snug">{option.label}</span>
                          {optionDisabled && (
                            <span className="text-xs text-zinc-500">
                              Not available for this release
                            </span>
                          )}
                        </div>
                      </FormLabel>
                    </FormItem>
                  );
                })}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Custom amount section — visible when premium is selected */}
      {selectedOption === 'premium-digital' && (
        <FormField
          control={form.control}
          name="finalAmount"
          render={({ field }) => (
            <FormItem>
              <div>
                <FormControl>
                  <div className="flex items-center gap-2 text-sm">
                    <span>Pay</span>
                    <div className="flex items-center gap-2">
                      <Input
                        {...field}
                        type="text"
                        inputMode="decimal"
                        placeholder={`$${effectiveSuggestedPrice.toFixed(2)}`}
                        className="w-24 text-center"
                        aria-label="Custom amount"
                        onChange={(e) => {
                          const raw = e.target.value
                            .replace(/[^\d.]/g, '')
                            .replace(/(\..*)\./g, '$1');
                          const [whole, decimal] = raw.split('.');
                          const sanitized =
                            decimal !== undefined ? `${whole}.${decimal.slice(0, 2)}` : raw;
                          field.onChange(sanitized ? `$${sanitized}` : '');
                        }}
                        onFocus={(e) => {
                          const raw = e.target.value.replace(/[^\d.]/g, '');
                          field.onChange(raw ? `$${raw}` : '');
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          const raw = e.target.value.replace(/[^\d.]/g, '');
                          if (!raw) return;
                          const num = parseFloat(raw);
                          if (Number.isFinite(num) && num >= 0) {
                            field.onChange(`$${num.toFixed(2)}`);
                          }
                        }}
                        /* v8 ignore start -- field.value is always a defined string (RHF defaultValues.finalAmount = ''), so the `?? ''` fallback is unreachable */
                        value={field.value ?? ''}
                        /* v8 ignore stop */
                      />
                      <em>suggested or pay what you want</em>
                    </div>
                  </div>
                </FormControl>

                <span className="text-sm">
                  to extend your support for <span className="font-semibold">{artistName}</span>
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {selectedOption === 'premium-digital' ? (
        <Button className="w-full" type="submit">
          <DownloadIcon className="size-4" />
          Buy &amp; Download for {displayAmount}
        </Button>
      ) : (
        <Button className="w-full" type="submit">
          <DownloadIcon className="size-4" />
          Download
        </Button>
      )}
    </form>
  </Form>
);

interface DownloadStepProps {
  hasPurchase: boolean;
  session: { user?: { email?: string | null; id?: string } } | null;
  purchasedAt: Date | null;
  downloadCount: number;
  resetInHours: number | null;
  releaseTitle: string;
  purchaseError: string | null;
  form: UseFormReturn<DownloadFormSchemaType>;
  selectedOption: string | undefined;
  effectiveSuggestedPrice: number;
  displayAmount: string;
  freeRadioDisabled: boolean;
  onSubmit: (data: DownloadFormSchemaType) => void;
  onContinueToFormatSelect: () => void;
  artistName: string;
}

export const DownloadStep = ({
  hasPurchase,
  session,
  purchasedAt,
  downloadCount,
  resetInHours,
  releaseTitle,
  purchaseError,
  form,
  selectedOption,
  effectiveSuggestedPrice,
  displayAmount,
  freeRadioDisabled,
  onSubmit,
  onContinueToFormatSelect,
  artistName,
}: DownloadStepProps): React.ReactElement => (
  <>
    <DialogHeader>
      <DialogTitle>Download</DialogTitle>
      <DialogDescription>
        {hasPurchase ? (
          <>
            You&apos;ve already purchased <strong>{releaseTitle}</strong>
          </>
        ) : (
          'Choose download format(s)'
        )}
      </DialogDescription>
    </DialogHeader>

    {purchaseError && <p className="text-destructive text-sm">{purchaseError}</p>}

    {hasPurchase && session?.user ? (
      <PurchasedSignedInActions
        purchasedAt={purchasedAt}
        downloadCount={downloadCount}
        resetInHours={resetInHours}
        releaseTitle={releaseTitle}
        onContinueToFormatSelect={onContinueToFormatSelect}
      />
    ) : hasPurchase && !session?.user ? (
      <Button asChild className="w-full">
        <Link href="/signin">
          <LogInIcon className="size-4" />
          Sign in to access your downloads
        </Link>
      </Button>
    ) : (
      <PurchaseDownloadForm
        form={form}
        selectedOption={selectedOption}
        effectiveSuggestedPrice={effectiveSuggestedPrice}
        displayAmount={displayAmount}
        freeRadioDisabled={freeRadioDisabled}
        onSubmit={onSubmit}
        artistName={artistName}
      />
    )}
  </>
);
