/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  posterCandidatesSchema,
  videoPosterCandidateSchema,
} from './video-poster-candidate-schema';

const candidate = {
  url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
  atSeconds: 3.7,
  score: 12.5,
};

describe('videoPosterCandidateSchema', () => {
  it('accepts a valid candidate', () => {
    expect(videoPosterCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it('rejects a non-URL url', () => {
    expect(videoPosterCandidateSchema.safeParse({ ...candidate, url: 'not-a-url' }).success).toBe(
      false
    );
  });

  it('rejects a negative atSeconds', () => {
    expect(videoPosterCandidateSchema.safeParse({ ...candidate, atSeconds: -1 }).success).toBe(
      false
    );
  });
});

describe('posterCandidatesSchema', () => {
  it('rejects more than 10 candidates', () => {
    expect(
      posterCandidatesSchema.safeParse(Array.from({ length: 11 }, () => candidate)).success
    ).toBe(false);
  });
});
