/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPublicSubmission, submissionMatching, submissionWhere } from './submission-where';
import { containsText, isUnsetOr } from './where-kit';

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

  it('listed is a public submission its owner chose to show', () => {
    expect(submissionWhere.listed).toEqual({ ...submissionWhere.public, listed: true });
  });
});

describe('submissionMatching', () => {
  it('reads the term as text, never as a pattern', () => {
    expect(submissionMatching('.*(')).toEqual({
      OR: [
        { title: containsText('.*(') },
        { aboutText: containsText('.*(') },
        { owner: { is: { username: containsText('.*(') } } },
      ],
    });
  });

  it('reads the title, the about text and the owner’s username, whatever the case', () => {
    const contains = { contains: 'bus', mode: 'insensitive' };

    expect(submissionMatching('bus')).toEqual({
      OR: [{ title: contains }, { aboutText: contains }, { owner: { is: { username: contains } } }],
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
