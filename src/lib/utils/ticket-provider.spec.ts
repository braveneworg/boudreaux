/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getTicketProvider } from './ticket-provider';

describe('getTicketProvider', () => {
  it('detects Bandsintown from bandsintown.com', () => {
    expect(getTicketProvider('https://www.bandsintown.com/e/12345')).toBe('bandsintown');
  });

  it('detects Bandsintown from subdomain', () => {
    expect(getTicketProvider('https://events.bandsintown.com/artist/ceschi')).toBe('bandsintown');
  });

  it('detects Bandsintown from short URL bnds.us', () => {
    expect(getTicketProvider('https://bnds.us/abc123')).toBe('bandsintown');
  });

  it('detects Eventbrite from eventbrite.com', () => {
    expect(getTicketProvider('https://www.eventbrite.com/e/my-event-12345')).toBe('eventbrite');
  });

  it('detects Eventbrite from eventbrite.co', () => {
    expect(getTicketProvider('https://www.eventbrite.co/e/my-event-12345')).toBe('eventbrite');
  });

  it('detects StubHub from stubhub.com', () => {
    expect(getTicketProvider('https://www.stubhub.com/some-event/12345')).toBe('stubhub');
  });

  it('detects Ticketmaster from ticketmaster.com', () => {
    expect(getTicketProvider('https://www.ticketmaster.com/event/12345')).toBe('ticketmaster');
  });

  it('detects Ticketmaster from livenation.com', () => {
    expect(getTicketProvider('https://www.livenation.com/event/12345')).toBe('ticketmaster');
  });

  it('returns null for unknown domains', () => {
    expect(getTicketProvider('https://www.example.com/tickets')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(getTicketProvider('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getTicketProvider('')).toBeNull();
  });

  it('is case-insensitive for hostname', () => {
    expect(getTicketProvider('https://WWW.BANDSINTOWN.COM/e/12345')).toBe('bandsintown');
  });
});
