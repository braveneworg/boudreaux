/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Textarea } from '@/app/components/ui/textarea';
import { TurnstileWidget } from '@/app/components/ui/turnstile-widget';
import { fileSubmissionReportAction } from '@/lib/actions/file-submission-report-action';
import {
  REPORT_CONTACT_EMAIL_MAX,
  REPORT_CONTACT_RETENTION_DAYS,
  REPORT_NOTE_MAX,
  SUBMISSION_REPORT_REASON_OPTIONS,
} from '@/lib/constants/submissions';
import type { SubmissionFieldErrors } from '@/lib/types/domain/submission';
import { submissionReportFormSchema } from '@/lib/validation/submission-report-schema';
import type {
  SubmissionReportFormInput,
  SubmissionReportFormValues,
} from '@/lib/validation/submission-report-schema';

import { useVerification } from './use-verification';

import type { Control, UseFormReturn } from 'react-hook-form';

export interface SubmissionReportDialogProps {
  submissionId: string;
  /** The submission's title as its page shows it. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ReportForm = UseFormReturn<SubmissionReportFormInput, unknown, SubmissionReportFormValues>;
type ReportControl = Control<SubmissionReportFormInput, unknown, SubmissionReportFormValues>;

const DESCRIPTION =
  'Tell our team what is wrong. A person reads every report. A report does not take this down by itself.';
const CONTACT_HELP = `Only if you want a reply. Only our admins can see it, and we erase it after ${REPORT_CONTACT_RETENTION_DAYS} days.`;
const THANKS = 'Thanks. Our team has your report.';

/** The form fields a server rule can name directly. */
const FIELDS = ['reason', 'note', 'contactEmail'] as const;

type ReportField = (typeof FIELDS)[number];

const isReportField = (key: string): key is ReportField => FIELDS.some((field) => field === key);

/** Put a refused report onto the form: each rule on its field, the rest above the buttons. */
const applyFailure = (
  form: ReportForm,
  error: string,
  fieldErrors: SubmissionFieldErrors | undefined
): string => {
  const unplaced = Object.entries(fieldErrors ?? {}).flatMap(([key, messages]) => {
    const [message] = messages;
    if (!isReportField(key) || message === undefined) {
      return messages;
    }

    form.setError(key, { type: 'server', message });
    return [];
  });

  // A refusal that named only form fields needs no second copy above the buttons.
  return fieldErrors === undefined || unplaced.length > 0 ? (unplaced.at(0) ?? error) : '';
};

/** The three reasons, as radio buttons: none is chosen for the reporter. */
const ReasonField = ({ control }: { control: ReportControl }) => {
  const groupId = useId();

  return (
    <FormField
      control={control}
      name="reason"
      render={({ field }) => (
        <FormItem>
          <span id={`${groupId}-legend`} className="text-sm font-medium">
            What is wrong?
          </span>
          <FormControl>
            <RadioGroup
              aria-labelledby={`${groupId}-legend`}
              value={field.value ?? ''}
              onValueChange={field.onChange}
            >
              {SUBMISSION_REPORT_REASON_OPTIONS.map(({ value, label, help }) => (
                <div key={value} className="flex items-start gap-3">
                  <RadioGroupItem
                    id={`${groupId}-${value}`}
                    value={value}
                    aria-describedby={`${groupId}-${value}-help`}
                  />
                  <div className="min-w-0">
                    <Label htmlFor={`${groupId}-${value}`}>{label}</Label>
                    <p id={`${groupId}-${value}-help`} className="text-muted-foreground text-sm">
                      {help}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

/** What the reporter wants the team to know, and how to reach them if they choose. */
const NoteAndContactFields = ({ control }: { control: ReportControl }) => (
  <>
    <FormField
      control={control}
      name="note"
      render={({ field }) => (
        <FormItem>
          <FormLabel>What should we know?</FormLabel>
          <FormControl>
            <Textarea rows={4} maxLength={REPORT_NOTE_MAX} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={control}
      name="contactEmail"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email (optional)</FormLabel>
          <FormControl>
            <Input
              type="email"
              autoComplete="email"
              maxLength={REPORT_CONTACT_EMAIL_MAX}
              {...field}
            />
          </FormControl>
          <FormDescription className="text-muted-foreground">{CONTACT_HELP}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </>
);

/** What replaces the form once the report has been sent. */
const Sent = ({ onDone }: { onDone: () => void }) => (
  <div className="min-w-0 space-y-4">
    <p role="status">{THANKS}</p>
    <DialogFooter>
      <Button type="button" onClick={onDone}>
        Done
      </Button>
    </DialogFooter>
  </div>
);

/**
 * The report dialog on a public submission's page (ADR-0025, ADR-0028): a
 * reason, an optional note and an optional contact email, behind a Turnstile
 * check. Anyone may send one, signed in or not. A report tells approvers and
 * changes nothing by itself, and the dialog says so.
 *
 * The answer never says whether the report was stored, so the thanks message
 * is all a reporter is shown. The Turnstile token is single use, so
 * verification is asked for again after a refused send.
 */
export const SubmissionReportDialog = ({
  submissionId,
  title,
  open,
  onOpenChange,
}: SubmissionReportDialogProps) => {
  const form = useForm<SubmissionReportFormInput, unknown, SubmissionReportFormValues>({
    resolver: zodResolver(submissionReportFormSchema),
    defaultValues: { note: '', contactEmail: '' },
  });
  const verification = useVerification();
  const [isSending, setIsSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSent, setIsSent] = useState(false);

  const send = async (values: SubmissionReportFormValues): Promise<void> => {
    setIsSending(true);
    setFormError('');
    const result = await fileSubmissionReportAction({
      submissionId,
      ...values,
      turnstileToken: verification.token,
    });

    verification.spend();
    setIsSending(false);

    if (result.success) {
      setIsSent(true);
    } else {
      setFormError(applyFailure(form, result.error, result.fieldErrors));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Report “${title}”`}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {isSent ? (
          <Sent onDone={() => onOpenChange(false)} />
        ) : (
          <Form {...form}>
            {/* Our own messages, not the browser's, say what is wrong with a field. */}
            <form noValidate onSubmit={form.handleSubmit(send)} className="min-w-0 space-y-4">
              <ReasonField control={form.control} />
              <NoteAndContactFields control={form.control} />
              <TurnstileWidget
                key={verification.round}
                isVerified={verification.isVerified}
                setIsVerified={verification.setIsVerified}
                onToken={verification.handleToken}
              />
              {formError !== '' && (
                <p role="alert" className="text-destructive text-sm font-medium">
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!verification.isVerified || isSending}>
                  Send report
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};
