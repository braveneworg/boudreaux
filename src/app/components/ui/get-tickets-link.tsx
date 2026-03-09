/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ExternalLink } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { TicketProviderIcon } from '@/app/components/ui/ticket-provider-icon';
import { cn } from '@/lib/utils';

interface GetTicketsLinkProps {
  /** The ticket purchase URL */
  ticketsUrl: string;
  /** Optional custom ticket provider icon URL */
  ticketIconUrl?: string | null;
  /** Button variant (default: 'outline') */
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  /** Button size (default: 'default') */
  size?: 'default' | 'sm' | 'lg';
  /** Link text (default: 'Get Tickets') */
  label?: string;
  /** Whether to show the ExternalLink icon after the label (default: false) */
  showExternalIcon?: boolean;
  /** Additional CSS class for the outer wrapper */
  className?: string;
}

/**
 * Reusable "Get Tickets" link with automatic ticket provider icon detection.
 * Displays: [ProviderIcon] Get Tickets [ExternalLinkIcon?]
 * Opens in a new tab. Applies vertical padding for tasteful spacing.
 */
export const GetTicketsLink = ({
  ticketsUrl,
  ticketIconUrl,
  variant = 'outline',
  size = 'default',
  label = 'Get Tickets',
  showExternalIcon = false,
  className,
}: GetTicketsLinkProps) => (
  <div className={cn('py-1', className)}>
    <Button asChild variant={variant} size={size}>
      <a href={ticketsUrl} target="_blank" rel="noopener noreferrer">
        <TicketProviderIcon
          ticketsUrl={ticketsUrl}
          ticketIconUrl={ticketIconUrl}
          size={size === 'sm' ? 16 : 20}
        />
        {label}
        {showExternalIcon && <ExternalLink className="ml-1 h-4 w-4" />}
      </a>
    </Button>
  </div>
);
