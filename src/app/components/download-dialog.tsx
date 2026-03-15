/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ComponentProps, ReactElement } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Download } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { SubscribeButton } from '@/app/components/subscribe-button';
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
import { cn } from '@/lib/utils/tailwind-utils';
import downloadSchema, {
  DOWNLOAD_OPTIONS,
  type DownloadFormSchemaType,
} from '@/lib/validation/download-schema';

interface DownloadDialogProps {
  artistName: string;
  premiumPrice?: number;
  children: ReactElement;
}

export const DownloadDialog = ({ artistName, premiumPrice = 8, children }: DownloadDialogProps) => {
  const [open, setOpen] = useState(false);

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
  const displayAmount = rawAmount
    ? `$${parseFloat(rawAmount).toFixed(2)}`
    : `$${premiumPrice.toFixed(2)}`;

  const handleSubmit = (data: DownloadFormSchemaType) => {
    // TODO: Implement actual download logic
    console.info('Download submitted:', data);
    setOpen(false);
    form.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset();
    }
  };

  const handleSubscribe = () => {
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
          <DialogDescription>Choose your preferred download format:</DialogDescription>
        </DialogHeader>
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
                        <FormItem key={option.value} className="flex items-center gap-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value={option.value} />
                          </FormControl>
                          <FormLabel className="cursor-pointer font-normal">
                            <div className="flex flex-col gap-1">
                              <div
                                className="leading-snug"
                                dangerouslySetInnerHTML={{ __html: option.label }}
                              />
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

            {/* Tip amount section — visible when premium is selected */}
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
                              placeholder={`$${premiumPrice.toFixed(2)}`}
                              className="w-24 text-center"
                              aria-label="Custom amount"
                              onChange={(e) => {
                                const raw = e.target.value
                                  .replace(/[^\d.]/g, '')
                                  .replace(/(\..*)\./g, '$1');
                                // Limit to 2 decimal places while typing
                                const [whole, decimal] = raw.split('.');
                                const sanitized =
                                  decimal !== undefined ? `${whole}.${decimal.slice(0, 2)}` : raw;
                                field.onChange(sanitized ? `$${sanitized}` : '');
                              }}
                              onFocus={(e) => {
                                // Strip formatting on focus for easier editing
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
                            <em>(suggested ${premiumPrice})</em>
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

            {/* Submit button */}
            <Button type="submit">
              {selectedOption === 'premium-digital' ? `Download for ${displayAmount}` : 'Download'}
            </Button>
          </form>
        </Form>

        {/* Subscribe CTA */}
        <div className="border-t pt-4">
          <p className="text-muted-foreground mb-3 text-sm">
            Want ACCESS TO ALL music on the Fake Four Inc. record label?
          </p>
          <SubscribeButton subscribeMessage="Subscribe" onClick={handleSubscribe} />
        </div>
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
