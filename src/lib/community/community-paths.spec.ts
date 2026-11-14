/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ALL_SUBMISSIONS_ID,
  COMMUNITY_PATH,
  submissionPath,
  userSubmissionsPath,
} from './community-paths';

describe('community paths', () => {
  it('names the community page', () => {
    expect(COMMUNITY_PATH).toBe('/community');
  });

  it('addresses a submission by its id alone', () => {
    expect(submissionPath('c'.repeat(24))).toBe(`/community/${'c'.repeat(24)}`);
  });

  it('addresses one user’s list as a filter on the community page', () => {
    expect(userSubmissionsPath('ada')).toBe('/community?user=ada');
  });

  it('encodes a username that would break the address', () => {
    expect(userSubmissionsPath('a&b c/d?e')).toBe('/community?user=a%26b%20c%2Fd%3Fe');
  });

  it('names the full list’s anchor', () => {
    expect(ALL_SUBMISSIONS_ID).toBe('all-submissions');
  });
});
