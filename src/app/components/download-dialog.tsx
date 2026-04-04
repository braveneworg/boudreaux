/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ComponentProps, ReactElement } from 'react';

import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { Download, DownloadIcon, UserPlus2Icon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';

import { CheckoutStep } from '@/app/components/checkout-step';
import { EmailStep } from '@/app/components/email-step';
import { FormatBundleDownload } from '@/app/components/format-bundle-download';
import { PurchaseCheckoutStep } from '@/app/components/purchase-checkout-step';
import { PurchaseSuccessStep } from '@/app/components/purchase-success-step';
import { RateSelectStep } from '@/app/components/rate-select-step';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
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
import { checkGuestPurchaseAction } from '@/lib/actions/check-guest-purchase-action';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { getSubscriberRate, SUBSCRIBER_RATE_MINIMUM } from '@/lib/subscriber-rates';
import type { SubscriberRateTier } from '@/lib/subscriber-rates';
import { cn } from '@/lib/utils/tailwind-utils';
import downloadSchema, {
  DOWNLOAD_OPTIONS,
  type DownloadFormSchemaType,
} from '@/lib/validation/download-schema';

type DialogStep =
  | 'download'
  | 'format-select'
  | 'rate-select'
  | 'email-step'
  | 'checkout'
  | 'purchase-checkout'
  | 'purchase-success'
  | 'returning-download';

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
  availableFormats?: AvailableFormat[];
  children: ReactElement;
}

export const DownloadDialog = ({
  artistName,
  premiumPrice = 8,
  releaseId,
  releaseTitle = '',
  suggestedPrice = null,
  hasPurchase = false,
  purchasedAt = null,
  downloadCount = 0,
  availableFormats = [],
  children,
}: DownloadDialogProps) => {
  const initialStep: DialogStep =
    hasPurchase && downloadCount < MAX_RELEASE_DOWNLOAD_COUNT ? 'format-select' : 'download';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>(initialStep);
  const [selectedTier, setSelectedTier] = useState<SubscriberRateTier | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [purchaseMode, setPurchaseMode] = useState(false);
  const [amountCents, setAmountCents] = useState<number>(0);
  const [guestAtCap, setGuestAtCap] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const { data: session } = useSession();

  const form = useForm<DownloadFormSchemaType>({
    resolver: zodResolver(downloadSchema),
    defaultValues: {
      downloadOption: undefined,
      finalAmount: '',
    },
  });

  const selectedOption = form.watch('downloadOption');
  const rawAmount = form
    .watch('finalAmount')
    ?.replace(/[^\d.]/g, '')
    .trim();

  const effectiveSuggestedPrice = suggestedPrice ?? premiumPrice ?? 5;
  const parsedRaw = rawAmount ? parseFloat(rawAmount) : NaN;
  const displayAmount = Number.isFinite(parsedRaw)
    ? `$${parsedRaw.toFixed(2)}`
    : `$${effectiveSuggestedPrice.toFixed(2)}`;

  const handleSubmit = (data: DownloadFormSchemaType) => {
    if (data.downloadOption === 'premium-digital') {
      const cleanedAmount = data.finalAmount?.replace(/[^\d.]/g, '').trim();
      const dollars = cleanedAmount ? Number(cleanedAmount) : effectiveSuggestedPrice;
      if (!Number.isFinite(dollars)) {
        /* v8 ignore next 2 -- Zod resolver rejects non-numeric amounts before handleSubmit runs */
        form.setError('finalAmount', { message: 'Amount must be a valid number' });
        return;
      }
      const cents = Math.round(dollars * 100);
      if (cents < 50) {
        form.setError('finalAmount', { message: 'Minimum amount is $0.50' });
        return;
      }
      setAmountCents(cents);
      if (session?.user) {
        setStep('purchase-checkout');
      } else {
        setPurchaseMode(true);
        setStep('email-step');
      }
    } else {
      console.info('Download submitted:', data);
      setOpen(false);
      form.reset();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset();
      setStep(initialStep);
      setSelectedTier(null);
      setCustomerEmail(null);
      setPurchaseMode(false);
      setAmountCents(0);
      setGuestAtCap(false);
      setPurchaseError(null);
    }
  };

  const handleSubscribe = () => {
    setStep('rate-select');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          'sm:max-w-md',
          (step === 'checkout' || step === 'purchase-checkout') &&
            'max-h-[90vh] overflow-y-auto sm:max-w-lg'
        )}
        /* v8 ignore next 3 -- Radix UI callback: not invocable from userEvent without real Radix focus management */
        onOpenAutoFocus={(e) => {
          if (step === 'checkout' || step === 'purchase-checkout') e.preventDefault();
        }}
      >
        {step === 'download' && (
          <>
            <DialogHeader>
              <DialogTitle>Download</DialogTitle>
              <DialogDescription>Choose download format(s)</DialogDescription>
            </DialogHeader>

            {purchaseError && <p className="text-destructive text-sm">{purchaseError}</p>}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                          {DOWNLOAD_OPTIONS.map((option) => (
                            <FormItem
                              key={option.value}
                              className="flex items-center gap-3 space-y-0"
                            >
                              <FormControl>
                                <RadioGroupItem value={option.value} />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">
                                <div className="flex flex-col gap-1">
                                  <span className="leading-snug">{option.label}</span>
                                  {option.value === 'premium-digital' && (
                                    <span className="text-muted-foreground">
                                      {' '}
                                      or <em>pay what you want</em>
                                    </span>
                                  )}
                                </div>
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Custom amount section — visible when premium is selected */}
                {selectedOption === 'premium-digital' && !hasPurchase && (
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
                                      decimal !== undefined
                                        ? `${whole}.${decimal.slice(0, 2)}`
                                        : raw;
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
                                  value={field.value ?? ''}
                                />
                                <em>(suggested ${effectiveSuggestedPrice})</em>
                              </div>
                            </div>
                          </FormControl>

                          <span className="text-sm">
                            to extend your support for{' '}
                            <span className="font-semibold">{artistName}</span>
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Already purchased — show message + format selection */}
                {selectedOption === 'premium-digital' && hasPurchase && (
                  <div className="space-y-4">
                    <p className="text-zinc-900 text-sm">
                      You already purchased this on{' '}
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
                        <p className="text-muted-foreground text-sm">
                          You&apos;ve reached the {MAX_RELEASE_DOWNLOAD_COUNT}-download limit.
                          Contact{' '}
                          <a href="mailto:support@fakefourinc.com" className="underline">
                            support@fakefourinc.com
                          </a>{' '}
                          for assistance.
                        </p>
                      </>
                    ) : (
                      <FormatBundleDownload
                        releaseId={releaseId}
                        releaseTitle={releaseTitle}
                        availableFormats={availableFormats}
                        downloadCount={downloadCount}
                      />
                    )}
                  </div>
                )}

                {/* Submit button — only when not already purchased */}
                {selectedOption === 'premium-digital' && !hasPurchase ? (
                  <Button className="w-full" type="submit">
                    <DownloadIcon className="size-4" />
                    Buy &amp; Download for {displayAmount}
                  </Button>
                ) : selectedOption === 'premium-digital' && hasPurchase ? null : (
                  <Button className="w-full" type="submit">
                    <DownloadIcon className="size-4" />
                    Download
                  </Button>
                )}
              </form>
            </Form>

            {/* Subscribe CTA */}
            <div className="border-t pt-4">
              <p className="text-muted-foreground mb-3 text-sm">
                Want <strong>ACCESS TO ALL</strong> music on the Fake Four Inc. record label?
              </p>
              <Button
                type="button"
                className="w-full !bg-(--fake-four-orange) text-white hover:bg-(--fake-four-orange-hover) focus-visible:ring-(--fake-four-orange) data-[state=open]:bg-(--fake-four-orange-hover)"
                variant="outline"
                onClick={handleSubscribe}
              >
                <UserPlus2Icon className="size-4" />
                Subscribe (from ${getSubscriberRate(SUBSCRIBER_RATE_MINIMUM)}/month)
              </Button>
            </div>
          </>
        )}

        {step === 'format-select' && (
          <>
            <DialogHeader>
              <DialogTitle>Download Again</DialogTitle>
              <DialogDescription>
                Select formats for <strong>{releaseTitle}</strong>
              </DialogDescription>
            </DialogHeader>
            {downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT ? (
              <>
                <Button className="w-full" type="button" disabled>
                  <DownloadIcon className="size-4" />
                  Download limit reached
                </Button>
                <p className="text-muted-foreground text-sm">
                  You&apos;ve reached the {MAX_RELEASE_DOWNLOAD_COUNT}-download limit. Contact{' '}
                  <a href="mailto:support@fakefourinc.com" className="underline">
                    support@fakefourinc.com
                  </a>{' '}
                  for assistance.
                </p>
              </>
            ) : (
              <FormatBundleDownload
                releaseId={releaseId}
                releaseTitle={releaseTitle}
                availableFormats={availableFormats}
                downloadCount={downloadCount}
              />
            )}
          </>
        )}

        {step === 'rate-select' && (
          <RateSelectStep
            selectedTier={selectedTier}
            onTierChange={setSelectedTier}
            onCancel={() => {
              setStep('download');
              setSelectedTier(null);
            }}
            onConfirm={() => {
              if (session?.user) {
                setStep('checkout');
              } else {
                setStep('email-step');
              }
            }}
          />
        )}

        {step === 'email-step' && (
          <EmailStep
            onCancel={() => {
              if (purchaseMode) {
                setPurchaseMode(false);
                setStep('download');
              } else {
                setStep('rate-select');
              }
            }}
            onConfirm={async (email: string) => {
              setCustomerEmail(email);
              if (purchaseMode) {
                const status = await checkGuestPurchaseAction(email, releaseId);
                if (status.hasPurchase) {
                  setGuestAtCap(status.atCap);
                  setStep('returning-download');
                } else {
                  setStep('purchase-checkout');
                }
              } else {
                setStep('checkout');
              }
            }}
          />
        )}

        {step === 'checkout' && selectedTier && (
          <CheckoutStep tier={selectedTier} customerEmail={customerEmail} />
        )}

        {step === 'purchase-checkout' && (
          <PurchaseCheckoutStep
            releaseId={releaseId}
            releaseTitle={releaseTitle}
            amountCents={amountCents}
            customerEmail={customerEmail ?? session?.user?.email}
            onConfirmed={() => setStep('purchase-success')}
            onCancel={() => setStep('download')}
            onError={(msg) => {
              setPurchaseError(msg);
              setStep('download');
            }}
          />
        )}

        {step === 'purchase-success' && (
          <PurchaseSuccessStep
            releaseId={releaseId}
            releaseTitle={releaseTitle}
            availableFormats={availableFormats}
            downloadCount={downloadCount}
            onDownloadStarted={() => setOpen(false)}
          />
        )}

        {step === 'returning-download' && (
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
                <p className="text-muted-foreground text-sm">
                  You&apos;ve reached the {MAX_RELEASE_DOWNLOAD_COUNT}-download limit. Contact{' '}
                  <a href="mailto:support@fakefourinc.com" className="underline">
                    support@fakefourinc.com
                  </a>{' '}
                  for assistance.
                </p>
              </>
            ) : availableFormats.length > 0 ? (
              <FormatBundleDownload
                releaseId={releaseId}
                releaseTitle={releaseTitle}
                availableFormats={availableFormats}
                downloadCount={downloadCount}
              />
            ) : (
              <Link href={`/api/releases/${releaseId}/download`}>
                <Button className="w-full" type="button">
                  <DownloadIcon className="size-4" />
                  Download Now
                </Button>
              </Link>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Reusable trigger button for the DownloadDialog.
 * Positioned absolutely — must be placed inside a `relative` container.
 */
export const DownloadTriggerButton = ({
  className,
  onClick,
  ref,
  ...props
}: ComponentProps<'button'>) => (
  <button
    ref={ref}
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
    className={cn(
      'flex items-center gap-1.5 rounded-sm border border-white bg-zinc-900 font-semibold opacity-90 px-2 py-1 text-white transition-opacity hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      className
    )}
    aria-label="Download music"
    {...props}
  >
    <Download className="size-3.5" />
    <span className="font-['Courier_New',monospace] text-sm leading-none">download</span>
  </button>
);
