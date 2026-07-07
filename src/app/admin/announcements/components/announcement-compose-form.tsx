/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Textarea } from '@/app/components/ui/textarea';
import { sendSmsBlastAction } from '@/lib/actions/send-sms-blast-action';
import {
  SMS_BLAST_MESSAGE_MAX,
  smsBlastSchema,
  type SmsBlastFormData,
} from '@/lib/validation/sms-blast-schema';
import { buildSmsBlastMessage, getSmsOptOutLine } from '@/utils/sms-blast-message';

interface AnnouncementComposeFormProps {
  recipientCount: number;
}

interface SentToastCounts {
  sentCount: number;
  recipientCount: number;
  failedCount: number;
}

/** SMS segment count for the full outgoing body: single up to 160, else 153/seg. */
const describeSegments = (totalLength: number): string =>
  totalLength <= 160 ? '1 SMS segment' : `${Math.ceil(totalLength / 153)} SMS segments`;

/** Success toast copy; appends the failure tally only when some sends failed. */
const buildSentToastMessage = ({
  sentCount,
  recipientCount,
  failedCount,
}: SentToastCounts): string => {
  const summary = `Sent to ${sentCount} of ${recipientCount} subscribers`;
  return failedCount > 0 ? `${summary} — ${failedCount} failed` : summary;
};

/**
 * Admin form to compose and send an SMS blast to every opted-in subscriber.
 * The submit button only opens a confirmation dialog; the blast is sent when
 * the admin confirms. Guards a re-entrant send with the `isSending` flag.
 */
export const AnnouncementComposeForm = ({
  recipientCount,
}: AnnouncementComposeFormProps): ReactElement => {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const form = useForm<SmsBlastFormData>({
    resolver: zodResolver(smsBlastSchema),
    defaultValues: { message: '' },
  });
  const { control, handleSubmit, reset, watch } = form;
  const message = watch('message');

  const hasRecipients = recipientCount > 0;
  const outgoingLength = buildSmsBlastMessage(message).length;
  const isSubmitDisabled = !hasRecipients || isSending || message.trim().length === 0;

  const openConfirmDialog = (): void => setIsDialogOpen(true);

  // Ignore close requests while a send is in flight so the dialog holds its
  // "Sending…" state until the action settles.
  const handleDialogOpenChange = (open: boolean): void => {
    if (isSending) return;
    setIsDialogOpen(open);
  };

  const handleConfirmSend = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    // Prevent the dialog's default close so the in-flight state stays visible;
    // it is closed explicitly in `finally`.
    event.preventDefault();
    setIsSending(true);
    try {
      const result = await sendSmsBlastAction({ message });
      if (result.success) {
        toast.success(buildSentToastMessage(result));
        reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSending(false);
      setIsDialogOpen(false);
    }
  };

  return (
    <section className="space-y-4">
      <Form {...form}>
        <form onSubmit={handleSubmit(openConfirmDialog)} className="space-y-4">
          <FormField
            control={control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={5}
                    placeholder="Write the announcement to send to subscribers."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="text-muted-foreground space-y-1 text-sm">
            <p>{`${message.length}/${SMS_BLAST_MESSAGE_MAX}`}</p>
            <p>{describeSegments(outgoingLength)}</p>
            <p>{`Appended automatically: ${getSmsOptOutLine()}`}</p>
          </div>

          <div className="space-y-1 text-sm">
            <p>{`Will send to ${recipientCount} subscribers`}</p>
            {!hasRecipients && (
              <p className="text-muted-foreground">No subscribers have opted in to SMS yet.</p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitDisabled}>
            Send announcement
          </Button>
        </form>
      </Form>

      <AlertDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Send this message to ${recipientCount} subscribers? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSend} disabled={isSending}>
              {isSending ? 'Sending…' : 'Send now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
