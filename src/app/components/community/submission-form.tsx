/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { SwitchField } from '@/app/components/forms/fields/switch-field';
import { TextField } from '@/app/components/forms/fields/text-field';
import {
  AlertDialog,
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
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { TurnstileWidget } from '@/app/components/ui/turnstile-widget';
import {
  publishSubmissionAction,
  saveSubmissionDraftAction,
} from '@/lib/actions/submission-actions';
import { queuePositionMessage } from '@/lib/community/queue-position-message';
import {
  MAX_SUBMISSION_LINKS,
  PUBLISH_REMINDER,
  SUBMISSION_CATEGORY_OPTIONS,
  submissionCategoryLabel,
  UPLOAD_AGREEMENT_WORDING,
} from '@/lib/constants/submissions';
import type { SubmissionCategory, SubmissionStatus } from '@/lib/constants/submissions';
import type { SavedSubmission, SubmissionFieldErrors } from '@/lib/types/domain/submission';
import type { AttachmentView } from '@/lib/types/domain/submission-attachment';
import { submissionFormSchema } from '@/lib/validation/submission-schema';
import type { SubmissionFormValues } from '@/lib/validation/submission-schema';

import { SubmissionAttachments } from './submission-attachments';
import { LISTED_HELP, LISTED_LABEL } from './submission-owner-controls';
import { SubmissionTextEditor } from './submission-text-editor';
import { useVerification } from './use-verification';

import type { Verification } from './use-verification';
import type { Control, FieldPath, UseFormReturn } from 'react-hook-form';

export interface SubmissionFormProps {
  /** The submission being edited; absent for a new one. */
  submission?: {
    id: string;
    title: string;
    category: SubmissionCategory;
    aboutHtml: string;
    writingHtml: string;
    links: string[];
    listed: boolean;
    status: SubmissionStatus;
    /** When the page read it, as an ISO string. */
    updatedAt: string;
    attachments: AttachmentView[];
  };
  /** Whether this account must accept the upload agreement before it can save. */
  needsAgreement: boolean;
}

const SAVE_OR_PUBLISH_NOTE =
  'Saving keeps a draft only you can see. Publishing sends it to our team for approval; nobody else can open it until it is approved.';
const EDIT_NOTE =
  'Saving a change to the title, text or links sends it for approval again. Until then nobody else can open it.';
const OFFLINE_WARNING = 'Editing takes this offline until it is approved again.';
const LINKS_HELP =
  'Official websites; social media post link; or something you think the Fake Four Inc. community should know about!';
const ATTACH_AFTER_SAVING_NOTE =
  'Save a draft first. Then you can add photos, audio and video to it here.';

/** The form fields a server rule can name directly. */
const NAMED_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'category',
  'aboutHtml',
  'writingHtml',
  'links',
  'listed',
  'acceptAgreement',
]);

/** The dirty flags a form reports for the fields whose change is a content edit. */
type ContentDirtyFlags = Partial<
  Record<'title' | 'category' | 'aboutHtml' | 'writingHtml', boolean>
> & {
  links?: unknown;
};

/** Whether any content field changed. `listed` is not content. */
const isContentDirty = ({
  title,
  category,
  aboutHtml,
  writingHtml,
  links,
}: ContentDirtyFlags): boolean => [title, category, aboutHtml, writingHtml, links].some(Boolean);

const LINK_ROW = /^links\.(\d+)$/;

/**
 * Where a server field error belongs on this form, or `null` for one the form
 * shows above its buttons (the verification token, `_form`). The server names
 * a link by its index; the form holds each link as a row with a `url`.
 */
const fieldPathFor = (key: string): FieldPath<SubmissionFormValues> | null => {
  const row = LINK_ROW.exec(key);
  if (row) {
    return `links.${Number(row.at(1))}.url`;
  }

  return NAMED_FIELDS.has(key) ? (key as FieldPath<SubmissionFormValues>) : null;
};

/** A new submission: empty, unlisted, a video unless its owner says otherwise. */
const NEW_SUBMISSION_VALUES: SubmissionFormValues = {
  title: '',
  category: 'VIDEO',
  aboutHtml: '',
  writingHtml: '',
  links: [],
  listed: false,
  acceptAgreement: false,
};

/**
 * The values the form opens with. Link rows come from the loaded submission
 * only: a default with more rows than a record holds would leave ghost rows.
 */
const defaultValuesFor = (submission: SubmissionFormProps['submission']): SubmissionFormValues =>
  submission
    ? {
        title: submission.title,
        category: submission.category,
        aboutHtml: submission.aboutHtml,
        writingHtml: submission.writingHtml,
        links: submission.links.map((url) => ({ url })),
        listed: submission.listed,
        acceptAgreement: false,
      }
    : NEW_SUBMISSION_VALUES;

interface LinksFieldProps {
  control: Control<SubmissionFormValues>;
  /** A rule about the links as a whole, such as the limit of ten. */
  error?: string;
}

/** Up to ten outbound links, one row each. */
const LinksField = ({ control, error }: LinksFieldProps) => {
  const { fields, append, remove } = useFieldArray({ control, name: 'links' });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Links</legend>
      <p className="text-muted-foreground text-sm">{LINKS_HELP}</p>
      {fields.map((row, index) => (
        <FormField
          key={row.id}
          control={control}
          name={`links.${index}.url`}
          render={({ field }) => (
            <FormItem>
              <div className="flex min-w-0 items-center gap-2">
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    aria-label={`Link ${index + 1}`}
                    className="min-w-0 flex-1"
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
      {error !== undefined && <p className="text-destructive text-sm">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= MAX_SUBMISSION_LINKS}
        onClick={() => append({ url: '' })}
      >
        <Plus className="size-4" aria-hidden />
        Add a link
      </Button>
    </fieldset>
  );
};

interface TextFieldsProps {
  control: Control<SubmissionFormValues>;
}

/** The writing (writings only) and the about, each in its own small editor. */
const TextFields = ({ control }: TextFieldsProps) => {
  const category = useWatch({ control, name: 'category' });

  return (
    <>
      {category === 'WRITING' && (
        <FormField
          control={control}
          name="writingHtml"
          render={({ field }) => (
            <FormItem>
              <span className="text-sm font-medium">Writing</span>
              <p className="text-muted-foreground text-sm">
                The work itself: lyrics, poetry, prose or a blurb.
              </p>
              <SubmissionTextEditor
                variant="writing"
                value={field.value}
                onChange={field.onChange}
                ariaLabel="Writing"
              />
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={control}
        name="aboutHtml"
        render={({ field }) => (
          <FormItem>
            <span className="text-sm font-medium">About</span>
            <p className="text-muted-foreground text-sm">A note about it, if you like.</p>
            <SubmissionTextEditor
              variant="about"
              value={field.value}
              onChange={field.onChange}
              ariaLabel="About"
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

/** What replaces the form once a submission has been sent for approval. */
const SentForApproval = ({ id, queuePosition }: SavedSubmission) => (
  <div role="status" className="border-foreground space-y-3 border-2 p-4">
    <p className="font-semibold">Sent for approval.</p>
    <p>{queuePositionMessage(queuePosition ?? 0)}</p>
    <p>We&apos;ll email you when it&apos;s live or if we need changes.</p>
    <div className="flex flex-wrap gap-3">
      <Button asChild variant="outline">
        <Link href={`/community/${id}`}>View your submission</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link href="/community/mine">Your submissions</Link>
      </Button>
    </div>
  </div>
);

/** Put a failed save onto the form: each rule on its field, the rest above the buttons. */
const applyFailure = (
  form: UseFormReturn<SubmissionFormValues>,
  error: string,
  fieldErrors: SubmissionFieldErrors | undefined
): string => {
  const unplaced = Object.entries(fieldErrors ?? {}).flatMap(([key, messages]) => {
    const path = fieldPathFor(key);
    const [message] = messages;
    if (path === null || message === undefined) {
      return messages;
    }

    form.setError(path, { type: 'server', message });
    return [];
  });

  // A failure that named only form fields needs no second copy above the buttons.
  return fieldErrors === undefined || unplaced.length > 0 ? (unplaced.at(0) ?? error) : '';
};

interface AgreementFieldProps {
  control: Control<SubmissionFormValues>;
  error?: string;
}

/** The upload agreement, as a switch: asked for once per version of its wording. */
const AgreementField = ({ control, error }: AgreementFieldProps) => (
  <div className="border-foreground border-2 p-3">
    <SwitchField
      control={control}
      name="acceptAgreement"
      id="submission-accept-agreement"
      label={UPLOAD_AGREEMENT_WORDING}
    />
    {error !== undefined && <p className="text-destructive mt-2 text-sm">{error}</p>}
  </div>
);

/** The category dropdown. */
const CategoryField = ({ control }: { control: Control<SubmissionFormValues> }) => (
  <FormField
    control={control}
    name="category"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Category</FormLabel>
        <Select value={field.value} onValueChange={field.onChange}>
          <FormControl>
            <SelectTrigger aria-label="Category" className="w-full">
              <SelectValue>{submissionCategoryLabel(field.value)}</SelectValue>
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {SUBMISSION_CATEGORY_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )}
  />
);

interface SubmitButtonsProps {
  /** Awaiting approval or approved: there is no draft to save, only changes. */
  isSettled: boolean;
  isLocked: boolean;
  onSave: () => void;
  onPublish: () => void;
}

/** What saving and publishing each do, then the buttons for this submission's state. */
const SubmitButtons = ({ isSettled, isLocked, onSave, onPublish }: SubmitButtonsProps) => (
  <div className="space-y-3">
    <p className="text-sm">{isSettled ? EDIT_NOTE : SAVE_OR_PUBLISH_NOTE}</p>
    <p className="text-muted-foreground text-sm">{PUBLISH_REMINDER}</p>
    <div className="flex flex-wrap gap-3">
      {isSettled ? (
        <Button type="button" disabled={isLocked} onClick={onSave}>
          Save changes
        </Button>
      ) : (
        <>
          <Button type="button" variant="outline" disabled={isLocked} onClick={onSave}>
            Save draft
          </Button>
          <Button type="button" disabled={isLocked} onClick={onPublish}>
            Publish
          </Button>
        </>
      )}
    </div>
  </div>
);

interface OfflineWarningProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asked before a content edit to an approved submission, which takes it offline. */
const OfflineWarning = ({ open, onCancel, onConfirm }: OfflineWarningProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onCancel();
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Send it for approval again?</AlertDialogTitle>
        <AlertDialogDescription>{OFFLINE_WARNING}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it as it is</AlertDialogCancel>
        <Button type="button" onClick={onConfirm}>
          Save and send for approval
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Awaiting approval or approved: there is no draft to save, only changes. */
const isSettledStatus = (status: SubmissionStatus | undefined): boolean =>
  status === 'AWAITING_APPROVAL' || status === 'APPROVED';

/** A rule about the links as a whole, wherever the resolver or the server put it. */
const linksErrorOf = (
  error: { message?: string; root?: { message?: string } } | undefined
): string | undefined => error?.root?.message ?? error?.message;

/** What the form shows after a successful save that did not enter the queue. */
const savedToast = (isSettled: boolean): string =>
  isSettled ? 'Changes saved.' : 'Draft saved. Only you can see it.';

interface SubmissionSave {
  /** Send the form: as a draft or an edit, or published for approval. */
  run: (values: SubmissionFormValues, publish: boolean) => Promise<void>;
  isSubmitting: boolean;
  /** A failure that belongs on no one field. */
  formError: string;
  /** Set once the submission has entered the queue. */
  sent: SavedSubmission | null;
}

/**
 * The form's round trip to the server: call the action, spend the Turnstile
 * token, then either put the failure on the form or move the owner on.
 */
const useSubmissionSave = (
  submission: SubmissionFormProps['submission'],
  form: UseFormReturn<SubmissionFormValues>,
  verification: Verification
): SubmissionSave => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState<SavedSubmission | null>(null);
  const status = submission?.status;

  /** Where a successful save leaves the owner. */
  const finish = (saved: SavedSubmission): void => {
    // It entered the queue: say so in place of the form.
    if (saved.status === 'AWAITING_APPROVAL' && status !== 'AWAITING_APPROVAL') {
      setSent(saved);
      return;
    }

    toast.success(savedToast(isSettledStatus(status)));
    if (submission) {
      router.refresh();
    } else {
      router.replace(`/community/${saved.id}/edit`);
    }
  };

  const run = async (values: SubmissionFormValues, publish: boolean): Promise<void> => {
    setIsSubmitting(true);
    setFormError('');
    const { links, ...rest } = values;
    const action = publish ? publishSubmissionAction : saveSubmissionDraftAction;
    const result = await action({
      ...(submission && { submissionId: submission.id }),
      ...rest,
      links: links.map(({ url }) => url),
      turnstileToken: verification.token,
    });

    verification.spend();
    setIsSubmitting(false);

    if (result.success) {
      finish(result.data);
    } else {
      setFormError(applyFailure(form, result.error, result.fieldErrors));
    }
  };

  return { run, isSubmitting, formError, sent };
};

/**
 * Where the attachments will go on a submission that is not saved yet: an
 * attachment needs a submission to belong to.
 */
const AttachAfterSaving = () => (
  <div className="space-y-1">
    <span className="text-sm font-medium">Attachments</span>
    <p className="text-muted-foreground text-sm">{ATTACH_AFTER_SAVING_NOTE}</p>
  </div>
);

/** A failure that belongs on no one field, shown above the buttons. */
const FormError = ({ message }: { message: string }) =>
  message === '' ? null : (
    <p role="alert" className="text-destructive text-sm font-medium">
      {message}
    </p>
  );

/**
 * The submission form: an upload agreement the first time, then a title, a
 * category, the attachments (once it is saved), the writing for a writings
 * submission, the listed choice, an about and up to ten links.
 *
 * A new, draft or rejected submission offers Save draft and Publish. One that
 * is awaiting approval or approved offers Save changes: a content edit to an
 * approved submission warns first, since it takes the submission offline until
 * it is approved again. The Turnstile token is single use, so verification is
 * asked for again after every round trip to the server.
 */
export const SubmissionForm = ({ submission, needsAgreement }: SubmissionFormProps) => {
  const form = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: defaultValuesFor(submission),
  });
  const verification = useVerification();
  const { run, isSubmitting, formError, sent } = useSubmissionSave(submission, form, verification);
  const [pendingValues, setPendingValues] = useState<SubmissionFormValues | null>(null);

  const { dirtyFields, errors } = form.formState;
  const needsWarning = submission?.status === 'APPROVED' && isContentDirty(dirtyFields);

  const submitAs = (publish: boolean) =>
    form.handleSubmit((values) => {
      if (needsWarning) {
        setPendingValues(values);
        return;
      }

      return run(values, publish);
    });

  const confirmEdit = (): void => {
    const values = pendingValues;
    setPendingValues(null);
    if (values) void run(values, false);
  };

  if (sent) {
    return <SentForApproval {...sent} />;
  }

  return (
    <Form {...form}>
      <form className="space-y-6" noValidate onSubmit={(event) => event.preventDefault()}>
        {needsAgreement && (
          <AgreementField control={form.control} error={errors.acceptAgreement?.message} />
        )}
        <TextField
          control={form.control}
          name="title"
          label="Title"
          placeholder="What is it called?"
        />
        <CategoryField control={form.control} />
        {submission ? (
          <SubmissionAttachments
            submissionId={submission.id}
            status={submission.status}
            updatedAt={submission.updatedAt}
            initialAttachments={submission.attachments}
          />
        ) : (
          <AttachAfterSaving />
        )}
        <TextFields control={form.control} />
        <div>
          <SwitchField
            control={form.control}
            name="listed"
            id="submission-listed"
            label={LISTED_LABEL}
          />
          <p className="text-muted-foreground mt-1 text-sm">{LISTED_HELP}</p>
        </div>
        <LinksField control={form.control} error={linksErrorOf(errors.links)} />
        <TurnstileWidget
          key={verification.round}
          isVerified={verification.isVerified}
          setIsVerified={verification.setIsVerified}
          onToken={verification.handleToken}
        />
        <FormError message={formError} />
        <SubmitButtons
          isSettled={isSettledStatus(submission?.status)}
          isLocked={!verification.isVerified || isSubmitting}
          onSave={submitAs(false)}
          onPublish={submitAs(true)}
        />
      </form>
      <OfflineWarning
        open={pendingValues !== null}
        onCancel={() => setPendingValues(null)}
        onConfirm={confirmEdit}
      />
    </Form>
  );
};
