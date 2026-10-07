/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bioImageWhere, bioLinkWhere, bioMediaWhere } from './bio-media-where';
import { isUnsetOr } from './where-kit';

describe('bioImageWhere', () => {
  it('chosen matches a numeric display position only (null and absent fail gte)', () => {
    expect(bioImageWhere.chosen).toEqual({ displayOrder: { gte: 0 } });
  });

  it('displayCandidate is the chosen fragment or the suggested flag', () => {
    expect(bioImageWhere.displayCandidate).toEqual({
      OR: [bioImageWhere.chosen, { isPrimary: true }],
    });
  });
});

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
