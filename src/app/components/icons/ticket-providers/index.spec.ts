/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as barrel from './index';

describe('ticket-providers barrel', () => {
  it('re-exports BandsintownIcon', () => {
    expect(typeof barrel.BandsintownIcon).toBe('function');
  });

  it('re-exports EventbriteIcon', () => {
    expect(typeof barrel.EventbriteIcon).toBe('function');
  });

  it('re-exports StubhubIcon', () => {
    expect(typeof barrel.StubhubIcon).toBe('function');
  });

  it('re-exports TicketmasterIcon', () => {
    expect(typeof barrel.TicketmasterIcon).toBe('function');
  });
});
