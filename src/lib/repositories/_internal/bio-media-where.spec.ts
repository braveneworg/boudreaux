/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bioLinkWhere, bioMediaWhere } from './bio-media-where';
import { isUnsetOr } from './where-kit';

describe('bioMediaWhere', () => {
  it('generatedOrLegacy reads an unset origin as generated; custom is the explicit value', () => {
    expect(bioMediaWhere.generatedOrLegacy).toEqual(isUnsetOr('origin', 'generated'));
    expect(bioMediaWhere.custom).toEqual({ origin: 'custom' });
  });
});

describe('bioLinkWhere', () => {
  it('reference reads an unset flag as true', () => {
    expect(bioLinkWhere.reference).toEqual(isUnsetOr('reference', true));
  });
});
