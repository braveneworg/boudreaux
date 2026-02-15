/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, useCallback, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm, FormProvider } from 'react-hook-form';
import { toast } from 'sonner';

import ContactForm from '@/app/components/forms/contact-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Card, CardContent } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { contactAction } from '@/lib/actions/contact-action';
import type { FormState } from '@/lib/types/form-state';
import contactSchema, { type ContactFormSchemaType } from '@/lib/validation/contact-schema';

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
    defaultValues: {
      reason: '',
      firstName: session?.user?.firstName || '',
      lastName: session?.user?.lastName || '',
      email: session?.user?.email || '',
      phone: session?.user?.phone || '',
      message: '',
    },
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
          setTurnstileToken(undefined);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);

          if (result.errors?.general) {
            toast.error(result.errors.general[0] || 'Something went wrong. Please try again.');
            form.setError('general', { message: result.errors.general.join(', ') });
          }

          if (result.errors?.reason) {
            form.setError('reason', { message: result.errors.reason.join(', ') });
          }

          if (result.errors?.firstName) {
            form.setError('firstName', { message: result.errors.firstName.join(', ') });
          }

          if (result.errors?.lastName) {
            form.setError('lastName', { message: result.errors.lastName.join(', ') });
          }

          if (result.errors?.email) {
            form.setError('email', { message: result.errors.email.join(', ') });
          }

          if (result.errors?.phone) {
            form.setError('phone', { message: result.errors.phone.join(', ') });
          }

          if (result.errors?.message) {
            form.setError('message', { message: result.errors.message.join(', ') });
          }
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
        <Card>
          <CardContent>
            <h1>Contact Us</h1>
            <div className="flex flex-col space-y-2 mb-4">
              <p>
                <strong>Co-founders/owners:</strong> Ceschi Ramos and David Ramos
              </p>
              <p>
                <strong>Label Manager:</strong> Dylan
              </p>
              <p>dylanowenmusic@gmail.com</p>
              <p>
                <strong>Distribution:</strong> Jeep Ward at Redeye Worldwide
              </p>
              <p>jeephalo@gmail.com</p>
              <p>
                <strong>Media and Fan Support:</strong> Niki
              </p>
              <p>nikianarchy@gmail.com</p>
              <p>
                <strong>Customer Service:</strong> Mo Niklz
              </p>
              <p>djmoniklz@gmail.com</p>
            </div>
            <p className="text-muted-foreground mb-6">
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
          </CardContent>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
};

export default ContactPage;
