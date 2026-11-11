/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPublicSubmission, submissionWhere } from './submission-where';
import { isUnsetOr } from './where-kit';

describe('submissionWhere', () => {
  it('unapproved is a draft, one awaiting approval, or a rejected one', () => {
    expect(submissionWhere.unapproved).toEqual({
      status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'REJECTED'] },
    });
  });

  it('awaitingApproval is that state alone', () => {
    expect(submissionWhere.awaitingApproval).toEqual({ status: 'AWAITING_APPROVAL' });
  });

  it('public is approved with an owner whose banned flag is false, null or absent', () => {
    expect(submissionWhere.public).toEqual({
      status: 'APPROVED',
      owner: { is: isUnsetOr('banned', false) },
    });
  });
});

describe('isPublicSubmission', () => {
  it.each([
    ['false', false],
    ['null', null],
    ['absent', undefined],
  ])('passes an approved submission whose owner has banned %s', (_name, banned) => {
    expect(isPublicSubmission({ status: 'APPROVED', owner: { banned } })).toBe(true);
  });

  it('refuses an approved submission whose owner is banned', () => {
    expect(isPublicSubmission({ status: 'APPROVED', owner: { banned: true } })).toBe(false);
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REJECTED'])(
    'refuses a %s submission whatever its owner',
    (status) => {
      expect(isPublicSubmission({ status, owner: { banned: false } })).toBe(false);
    }
  );
});
