/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';

import {
  BandsintownIcon,
  EventbriteIcon,
  StubhubIcon,
  TicketmasterIcon,
} from '@/app/components/icons/ticket-providers';
import { getTicketProvider, type TicketProvider } from '@/lib/utils/ticket-provider';

interface TicketProviderIconProps {
  /** The ticket URL to auto-detect the provider from */
  ticketsUrl: string;
  /** Optional custom icon URL that overrides auto-detection */
  ticketIconUrl?: string | null;
  /** Icon size in pixels (default: 20) */
  size?: number;
  /** Additional CSS class names */
  className?: string;
}

/** Map of provider keys to their inline SVG components */
const PROVIDER_ICON_MAP: Record<
  TicketProvider,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  bandsintown: BandsintownIcon,
  eventbrite: EventbriteIcon,
  stubhub: StubhubIcon,
  ticketmaster: TicketmasterIcon,
};

/**
 * Renders the appropriate ticket provider icon.
 * Priority: ticketIconUrl (custom) > auto-detected provider > null (renders nothing)
 */
export const TicketProviderIcon = ({
  ticketsUrl,
  ticketIconUrl,
  size = 20,
  className,
}: TicketProviderIconProps) => {
  // Priority 1: Custom uploaded icon
  if (ticketIconUrl) {
    return (
      <Image
        src={ticketIconUrl}
        alt="Ticket provider"
        width={size}
        height={size}
        className={className}
      />
    );
  }

  // Priority 2: Auto-detected provider icon
  const provider = getTicketProvider(ticketsUrl);
  if (provider) {
    const IconComponent = PROVIDER_ICON_MAP[provider];
    return <IconComponent size={size} className={className} />;
  }

  // Priority 3: No icon available
  return null;
};
