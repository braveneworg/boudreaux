/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React from 'react';

import { motion } from 'framer-motion';

import ComboboxField from '@/app/components/forms/fields/combobox-field';
import TextField from '@/app/components/forms/fields/text-field';
import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import StatusIndicator from '@/app/components/ui/status-indicator';
import { Textarea } from '@/app/components/ui/textarea';
import TurnstileWidget from '@/app/components/ui/turnstile-widget';
import type { FormState } from '@/lib/types/form-state';
import { CONTACT_REASONS, type ContactFormSchemaType } from '@/lib/validation/contact-schema';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface ContactFormProps {
  control: Control<ContactFormSchemaType>;
  isPending: boolean;
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  onTurnstileToken: (token: string) => void;
  state: FormState;
  setValue: UseFormSetValue<ContactFormSchemaType>;
}

const ContactForm = ({
  control,
  isPending,
  isVerified,
  setIsVerified,
  onTurnstileToken,
  state,
  setValue,
}: ContactFormProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <ComboboxField
        control={control}
        name="reason"
        label="Reason"
        placeholder="Select a reason..."
        searchPlaceholder="Search reasons..."
        emptyMessage="No matching reason"
        options={[...CONTACT_REASONS]}
        popoverWidth="w-full"
        setValue={setValue}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="firstName"
          label="First name"
          placeholder="First name"
          setValue={setValue}
        />
        <TextField
          control={control}
          name="lastName"
          label="Last name"
          placeholder="Last name"
          setValue={setValue}
        />
      </div>

      <TextField
        control={control}
        name="email"
        label="Email"
        placeholder="Email address"
        type="email"
        setValue={setValue}
      />

      <TextField
        control={control}
        name="phone"
        label="Phone (optional)"
        placeholder="Phone number"
        type="tel"
        setValue={setValue}
      />

      <FormField
        control={control}
        name="message"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Message</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="How can we help?"
                rows={6}
                className="min-h-[120px] resize-y"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <TurnstileWidget
        isVerified={isVerified}
        setIsVerified={setIsVerified}
        onToken={onTurnstileToken}
      />

      <div className="flex items-center gap-3 mt-4">
        <Button disabled={isPending} size="lg">
          Send message
        </Button>
        <StatusIndicator
          isSuccess={state.success}
          hasError={!!(state.errors && Object.keys(state.errors).length > 0)}
          hasTimeout={state.hasTimeout}
          isPending={isPending}
        />
      </div>

      {state.errors?.general && state.errors.general.length > 0 && (
        <div className="mt-2">
          <FormMessage className="text-red-600">{state.errors.general[0]}</FormMessage>
        </div>
      )}
    </motion.div>
  );
};

export default ContactForm;
