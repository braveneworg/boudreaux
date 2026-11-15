/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ALL_SUBMISSIONS_ID,
  COMMUNITY_PATH,
  SUBMISSION_PARAM,
  submissionDeepLink,
  submissionReadPath,
  submissionViewPath,
  userSubmissionsPath,
} from './community-paths';

describe('community paths', () => {
  it('names the community page', () => {
    expect(COMMUNITY_PATH).toBe('/community');
  });

  it('addresses a submission as the community page with it open, by its id alone', () => {
    expect(submissionDeepLink('c'.repeat(24))).toBe(`/community?submission=${'c'.repeat(24)}`);
  });

  it('names the deep link’s parameter', () => {
    expect(SUBMISSION_PARAM).toBe('submission');
  });

  it('addresses the route that answers one submission to its reader', () => {
    expect(submissionReadPath('c'.repeat(24))).toBe(`/api/community/submissions/${'c'.repeat(24)}`);
  });

  it('addresses one user’s list as a filter on the community page', () => {
    expect(userSubmissionsPath('ada')).toBe('/community?user=ada');
  });

  it('encodes a username that would break the address', () => {
    expect(userSubmissionsPath('a&b c/d?e')).toBe('/community?user=a%26b%20c%2Fd%3Fe');
  });

  it('addresses the route that counts a view of a submission', () => {
    expect(submissionViewPath('c'.repeat(24))).toBe(
      `/api/community/submissions/${'c'.repeat(24)}/view`
    );
  });

  it('names the full list’s anchor', () => {
    expect(ALL_SUBMISSIONS_ID).toBe('all-submissions');
  });
});
