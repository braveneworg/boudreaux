/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState, type FormEvent } from 'react';

import { CircleAlert, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { submitAbuseReportAction } from '@/lib/actions/submit-abuse-report-action';
import { cn } from '@/lib/utils';

type PopoverState = 'form' | 'confirmation';

/**
 * "Report abuse (anonymously)" sticky link + popover, rendered at the
 * top of the chat drawer.
 *
 * Two visual states swap inside the same popover surface:
 * - `form`: username input + Report submit
 * - `confirmation`: "Thank you for keeping our community safe!" + Close
 *
 * Both states render the X icon in the upper-right corner; clicking X
 * (or clicking outside the popover) dismisses it regardless of state.
 *
 * Anonymity is enforced server-side. The popover only sends the typed
 * username; the reporter id is sourced from the auth session in
 * {@link submitAbuseReportAction}.
 */
export const ChatReportAbusePopover = () => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PopoverState>('form');
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setState('form');
    setUsername('');
    setIsSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        // Tiny delay so the user does not see the popover snap back to
        // the form state while it's still fading out.
        setTimeout(reset, 150);
      }
    },
    [reset]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = username.trim();
      if (!trimmed || isSubmitting) return;

      setIsSubmitting(true);
      try {
        const result = await submitAbuseReportAction({ reportedUsername: trimmed });
        if (result.success) {
          setState('confirmation');
          return;
        }
        if (result.error === 'rate_limited') {
          toast.error(
            `You've reported recently — try again in ${result.retryAfterSeconds ?? 'a little while'} seconds.`
          );
        } else if (result.error === 'self_report') {
          toast.error("You can't report your own account.");
        } else if (result.error === 'unauthorized') {
          toast.error('Please sign in to submit a report.');
        } else if (result.error === 'invalid') {
          toast.error(
            result.fieldErrors?.reportedUsername?.[0] ?? 'Please enter a valid username.'
          );
        } else {
          toast.error('Could not submit your report. Please try again.');
        }
      } catch (error) {
        console.error('Abuse report submission failed', error);
        toast.error('Could not submit your report. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [username, isSubmitting]
  );

  return (
    <div className="bg-background sticky top-0 z-10 flex justify-center border-b py-2">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-zinc-950',
              'hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-950/30 focus-visible:outline-none'
            )}
          >
            <CircleAlert aria-hidden="true" className="size-4 text-zinc-950" />
            <span>Report abuse (anonymously)</span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="center"
          side="bottom"
          sideOffset={8}
          className="relative w-80"
          // Keep keyboard focus inside the popover for the X button.
          onOpenAutoFocus={(event) => {
            // Default focus lands on the first focusable child. For the
            // form state that's the username input — which is what we
            // want — so don't preventDefault.
            if (state === 'confirmation') {
              event.preventDefault();
            }
          }}
        >
          <button
            type="button"
            aria-label="Close report dialog"
            onClick={() => handleOpenChange(false)}
            className="text-muted-foreground hover:text-foreground absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-md transition-colors"
          >
            <X aria-hidden="true" className="size-4" />
          </button>

          {state === 'form' ? (
            <form className="mt-1 flex flex-col gap-3 pr-6" onSubmit={handleSubmit}>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Type username"
                  aria-label="Username to report"
                  maxLength={64}
                  autoComplete="off"
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!username.trim() || isSubmitting}
                  className="bg-black text-white hover:bg-zinc-800"
                >
                  Report
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Your report is anonymous. Admins will not see who submitted it.
              </p>
            </form>
          ) : (
            <div className="mt-1 flex flex-col items-center gap-2 pr-6 text-center">
              <p className="text-sm text-zinc-950">Thank you for keeping our community safe!</p>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="text-xs text-zinc-950 underline-offset-2 hover:underline"
              >
                Close
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
