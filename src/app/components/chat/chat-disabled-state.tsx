/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

/**
 * Rendered inside the chat drawer when the current viewer has been
 * disabled from chat or matches an active {@link BannedIdentity}.
 * Replaces the message list and input entirely — the user sees only
 * this message and a link to the contact form.
 *
 * Privacy: deliberately does not surface the ban reason or the admin
 * who took the action. Targeted users are not told why beyond "abuse"
 * to avoid coaching evasion attempts.
 */
export const ChatDisabledState = () => {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-foreground text-sm leading-relaxed">
        You have been reported for abuse. If you think this was done in error or would like to know
        why, please{' '}
        <Link href="/contact" className="text-foreground underline-offset-2 hover:underline">
          contact support
        </Link>
        .
      </p>
    </div>
  );
};
