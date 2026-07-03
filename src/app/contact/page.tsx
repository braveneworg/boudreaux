/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Fragment, useState, useCallback, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import { toast } from 'sonner';

import { ContactForm } from '@/app/components/forms/contact-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { useSession } from '@/app/hooks/use-session';
import type { SessionUser } from '@/app/hooks/use-session';
import { ImageHeading } from '@/components/ui/image-heading';
import { contactAction } from '@/lib/actions/contact-action';
import type { FormState } from '@/lib/types/form-state';
import { contactSchema, type ContactFormSchemaType } from '@/lib/validation/contact-schema';

interface ContactEntry {
  role: string;
  name: string;
  email?: string;
}

const CONTACTS: readonly ContactEntry[] = [
  { role: 'Co-founders/owners', name: 'Ceschi Ramos and David Ramos' },
  { role: 'Label Manager', name: 'Dylan', email: 'dylanowenmusic@gmail.com' },
  { role: 'Distribution', name: 'Jeep Ward at Redeye Worldwide', email: 'jeephalo@gmail.com' },
  { role: 'Media and Fan Support', name: 'Niki', email: 'nikianarchy@gmail.com' },
  { role: 'Customer Service', name: 'Mo Niklz', email: 'djmoniklz@gmail.com' },
];

/** Builds the contact form's default values, prefilling from the session user when present. */
const buildContactDefaults = (user: SessionUser | undefined): ContactFormSchemaType => ({
  reason: '',
  firstName: user?.firstName || '',
  lastName: user?.lastName || '',
  email: user?.email || '',
  phone: user?.phone || '',
  message: '',
});

const ContactPage = () => {
  const { data: session } = useSession();

  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const [state, setState] = useState<FormState>({
    errors: {},
    fields: {},
    success: false,
  });

  const form = useForm<ContactFormSchemaType>({
    defaultValues: buildContactDefaults(session?.user),
    resolver: zodResolver(contactSchema),
  });

  useEffect(() => {
    const user = session?.user;
    if (user) {
      if (user.firstName) form.setValue('firstName', user.firstName);
      if (user.lastName) form.setValue('lastName', user.lastName);
      if (user.email) form.setValue('email', user.email);
      if (user.phone) form.setValue('phone', user.phone);
    }
  }, [session, form]);

  const handleSubmit = useCallback(
    async (data: ContactFormSchemaType) => {
      if (!isVerified) {
        form.setError('general', {
          message: 'Please verify you are human using the widget above.',
        });
        return;
      }

      setIsSubmitting(true);

      try {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });

        if (turnstileToken) {
          formData.append('cf-turnstile-response', turnstileToken);
        }

        const result = await contactAction(state, formData);
        setState(result);

        if (result.success) {
          toast.success("Your message has been sent. We'll get back to you soon.");
          form.reset();
          setIsVerified(false);
          setTurnstileToken('');
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);

          const errorFields = [
            'general',
            'reason',
            'firstName',
            'lastName',
            'email',
            'phone',
            'message',
          ] as const;

          const errorsByField = new Map(Object.entries(result.errors ?? {}));
          errorFields.forEach((field) => {
            const messages = errorsByField.get(field);

            if (!messages || messages.length === 0) {
              return;
            }

            if (field === 'general') {
              toast.error(messages[0] || 'Something went wrong. Please try again.');
            }

            form.setError(field, { message: messages.join(', ') });
          });
        }
      } catch (error) {
        console.error('Contact form submission error:', error);
        setIsSubmitting(false);
        form.setError('general', {
          message: 'An unexpected error occurred. Please try again.',
        });
      }
    },
    [isVerified, state, form, turnstileToken]
  );

  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={[{ anchorText: 'Contact', url: '/contact', isActive: true }]} />
        <ZinePanel accent="orange">
          <ImageHeading
            src="/media/headings/CONTACT.webp"
            alt="contact"
            imageHeight={480}
            imageClassName="w-full"
            priority
          />
          <div className="mb-4 flex flex-col space-y-2">
            {CONTACTS.map(({ role, name, email }) => (
              <Fragment key={role}>
                <p>
                  <strong>{role}:</strong> {name}
                </p>
                {email && (
                  <p>
                    <a
                      href={`mailto:${email}`}
                      aria-label={`Email ${role}, ${email}`}
                      className="inline-flex items-center gap-1.5 underline"
                    >
                      <Mail aria-hidden className="size-4 shrink-0" />
                      {email}
                    </a>
                  </p>
                )}
              </Fragment>
            ))}
          </div>
          <p className="mb-6 text-zinc-950">
            Have a question, demo, or business inquiry? Fill out the form below and we&apos;ll get
            back to you.
          </p>
          <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit(handleSubmit)}>
              <ContactForm
                control={form.control}
                isPending={isSubmitting}
                isVerified={isVerified}
                setIsVerified={setIsVerified}
                onTurnstileToken={setTurnstileToken}
                state={state}
                setValue={form.setValue}
              />
            </form>
          </FormProvider>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
};

export default ContactPage;
