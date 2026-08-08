/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { ChevronDown } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';

/** Descriptions at or under this length render in full with no control. */
const CLAMP_THRESHOLD = 500;

interface ExpandableDescriptionProps {
  text: string;
}

/**
 * Admin-card description that collapses past ~500 characters: the clamped
 * prose fades out under a transparent→card gradient laid over its last
 * visible line, and a down-arrow toggle expands the card row to the full
 * text (rotating into a collapse control). Short descriptions render as a
 * plain paragraph.
 */
export const ExpandableDescription = ({ text }: ExpandableDescriptionProps): ReactElement => {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= CLAMP_THRESHOLD) {
    return <p className="text-sm whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div>
      <div className="relative">
        <p className={cn('text-sm whitespace-pre-wrap', !expanded && 'max-h-24 overflow-hidden')}>
          {text}
        </p>
        {!expanded ? (
          <div
            aria-hidden="true"
            data-slot="description-fade"
            className="to-card pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent"
          />
        ) : null}
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse description' : 'Show full description'}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
      </div>
    </div>
  );
};
