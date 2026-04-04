/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/app/components/ui/switch';
import TurnstileWidget from '@/app/components/ui/turnstile-widget';
import { resolveSubscriberAction } from '@/lib/actions/resolve-subscriber-action';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import emailStepSchema from '@/lib/validation/email-step-schema';
import type { EmailStepFormSchemaType } from '@/lib/validation/email-step-schema';

interface EmailStepProps {
  onCancel: () => void;
  onConfirm: (email: string) => void;
}

export const EmailStep = ({ onCancel, onConfirm }: EmailStepProps) => {
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');

  const form = useForm<EmailStepFormSchemaType>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: {
      email: '',
      termsAndConditions: false,
    },
  });

  const handleSubmit = async (data: EmailStepFormSchemaType) => {
    setIsPending(true);
    setServerError(null);

    const turnstileResult = await verifyTurnstile(turnstileToken);

    if (!turnstileResult.success) {
      setServerError(turnstileResult.error ?? 'Bot verification failed. Please try again.');
      setIsPending(false);
      setIsVerified(false);
      setTurnstileToken('');
      return;
    }

    const result = await resolveSubscriberAction({
      email: data.email,
      termsAccepted: data.termsAndConditions,
    });

    setIsPending(false);

    if (!result.success) {
      setServerError(result.error ?? 'Something went wrong');
      return;
    }

    onConfirm(data.email);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Your Email</DialogTitle>
        <DialogDescription>Enter your email to continue to checkout.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <Input type="email" placeholder="you@example.com" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="termsAndConditions"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="text-sm leading-snug">
                  I accept the{' '}
                  <Link href="/legal/terms-and-conditions" target="_blank" className="underline">
                    terms and conditions
                  </Link>
                </FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />

          <TurnstileWidget
            isVerified={isVerified}
            setIsVerified={setIsVerified}
            onToken={setTurnstileToken}
          />

          {serverError && <p className="text-destructive text-sm">{serverError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Back
            </Button>
            <Button type="submit" disabled={isPending || !isVerified}>
              {isPending ? 'Checking...' : 'Continue to Checkout'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
