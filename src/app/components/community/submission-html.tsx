/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import parse from 'html-react-parser';

import { cn } from '@/lib/utils';

/** The reading measure and rhythm for a submission's about and writing. */
export const SUBMISSION_PROSE_CLASS = cn(
  'max-w-[68ch] text-[17px] leading-7 text-zinc-900',
  '[&_p]:my-4',
  '[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold',
  '[&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold',
  '[&_a]:underline [&_a]:underline-offset-4'
);

interface SubmissionHtmlProps {
  /** Stored submission HTML: already sanitized by the service when it was saved. */
  html: string;
  className?: string;
}

/**
 * Renders a submission's stored about or writing. The HTML was sanitized
 * against its allowlist before it was stored, so it is parsed into elements as
 * it stands; a link in it already carries its hardening. Renders nothing for
 * an empty field.
 */
export const SubmissionHtml = ({ html, className }: SubmissionHtmlProps) =>
  html === '' ? null : <div className={cn(SUBMISSION_PROSE_CLASS, className)}>{parse(html)}</div>;
