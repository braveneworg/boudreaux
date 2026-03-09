/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Known ticket provider identifiers for auto-detection from URLs
 */
export type TicketProvider = 'bandsintown' | 'eventbrite' | 'stubhub' | 'ticketmaster';

/**
 * Domain-to-provider mapping. Each entry maps one or more domain
 * suffixes to a provider key.
 */
const PROVIDER_DOMAIN_MAP: Array<{ domains: string[]; provider: TicketProvider }> = [
  { domains: ['bandsintown.com', 'bnds.us'], provider: 'bandsintown' },
  { domains: ['eventbrite.com', 'eventbrite.co'], provider: 'eventbrite' },
  { domains: ['stubhub.com'], provider: 'stubhub' },
  { domains: ['ticketmaster.com', 'livenation.com'], provider: 'ticketmaster' },
];

/**
 * Parse a ticket URL and return the detected provider, or null if unrecognized.
 */
export function getTicketProvider(url: string): TicketProvider | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const entry of PROVIDER_DOMAIN_MAP) {
      if (entry.domains.some((domain) => hostname.endsWith(domain))) {
        return entry.provider;
      }
    }
    return null;
  } catch {
    return null;
  }
}
