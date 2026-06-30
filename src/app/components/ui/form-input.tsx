/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Ref } from 'react';

import { cn } from '@/lib/utils/tailwind-utils';

import { Input } from './input';

interface FormInputProperties {
  id: string;
  placeholder: string;
  type: string;
  value: string;
  autoComplete?: string;
  /** Extra classes merged onto the underlying input (after the base sizing). */
  className?: string;
  /**
   * Forwarded ref (e.g. from React Hook Form's `field.ref`). It is merged with
   * the internal focus ref so both consumers keep working.
   */
  ref?: Ref<HTMLInputElement>;
  /**
   * When true, the input is programmatically focused on mount. This mirrors the
   * native `autoFocus` behavior but applies focus via a ref + mount effect so we
   * avoid emitting the `autoFocus` attribute (jsx-a11y/no-autofocus).
   */
  autoFocusOnMount?: boolean;
}

export const FormInput = ({
  id,
  placeholder,
  type,
  autoComplete,
  autoFocusOnMount,
  className,
  ref,
  ...properties
}: FormInputProperties) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge the internal focus ref with any forwarded ref (e.g. RHF's field.ref)
  // so neither consumer clobbers the other.
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  useEffect(() => {
    if (autoFocusOnMount) inputRef.current?.focus();
  }, [autoFocusOnMount]);

  return (
    <Input
      ref={setRef}
      className={cn('h-12 text-lg', className)}
      id={id}
      placeholder={placeholder}
      type={type}
      autoComplete={autoComplete}
      {...properties}
    />
  );
};
