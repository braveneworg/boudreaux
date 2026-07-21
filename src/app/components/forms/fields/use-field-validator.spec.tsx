/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Form } from '@/app/components/ui/form';

import { TextField } from './text-field';

const schema = z.object({ email: z.string().email({ message: 'Bad email' }) });
type Values = z.infer<typeof schema>;

/**
 * Renders a real (unmocked) TextField over a real React Hook Form so the test
 * observes what a user would see, rather than which setter was called.
 *
 * `withProvider` exists to cover the degrade path: a field rendered outside a
 * `FormProvider` has no form to trigger, and must not throw.
 */
const Harness = ({
  validateOnChange,
  withProvider = true,
}: {
  validateOnChange?: boolean;
  withProvider?: boolean;
}) => {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  const field = (
    <TextField
      control={form.control}
      name="email"
      label="Email"
      placeholder="Email"
      validateOnChange={validateOnChange}
    />
  );

  return withProvider ? <Form {...form}>{field}</Form> : field;
};

const type = async (text: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), text);
};

describe('useFieldValidator via TextField', () => {
  // Every form in the app leaves RHF on its default `mode: 'onSubmit'`, so this
  // error would otherwise stay hidden until the first submit attempt.
  it('surfaces the validation error while typing when validateOnChange is set', async () => {
    render(<Harness validateOnChange />);

    await type('not-an-email');

    await waitFor(() => {
      expect(screen.getByText('Bad email')).toBeInTheDocument();
    });
  });

  it('stays quiet while typing when validateOnChange is omitted', async () => {
    render(<Harness />);

    await type('not-an-email');

    expect(screen.queryByText('Bad email')).not.toBeInTheDocument();
  });

  it('clears the error once the value becomes valid', async () => {
    render(<Harness validateOnChange />);

    await type('bad');
    await waitFor(() => {
      expect(screen.getByText('Bad email')).toBeInTheDocument();
    });

    await type('@example.com');

    await waitFor(() => {
      expect(screen.queryByText('Bad email')).not.toBeInTheDocument();
    });
  });

  it('records what the user typed', async () => {
    render(<Harness validateOnChange />);

    await type('someone@example.com');

    expect(screen.getByRole('textbox')).toHaveValue('someone@example.com');
  });

  // The hook runs before FormLabel, so reading context defensively is what
  // keeps the canonical error owned by form.tsx. Without it the developer sees
  // "cannot destructure property 'trigger' of null" instead.
  it('leaves the missing-provider error to FormLabel rather than pre-empting it', () => {
    expect(() => render(<Harness validateOnChange withProvider={false} />)).toThrow(
      /within a FormProvider/
    );
  });
});
