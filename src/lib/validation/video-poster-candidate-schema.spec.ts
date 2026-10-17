/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VIDEO_POSTER_CANDIDATE_CAP } from '@/lib/constants/video-uploads';

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

  it('rejects a javascript: scheme URL', () => {
    expect(
      videoPosterCandidateSchema.safeParse({ ...candidate, url: 'javascript:alert(1)' }).success
    ).toBe(false);
  });

  it('rejects a negative atSeconds', () => {
    expect(videoPosterCandidateSchema.safeParse({ ...candidate, atSeconds: -1 }).success).toBe(
      false
    );
  });
});

describe('posterCandidatesSchema', () => {
  it('caps the list at the shared candidate cap of 25', () => {
    expect(VIDEO_POSTER_CANDIDATE_CAP).toBe(25);
  });

  it('accepts a list at the cap', () => {
    expect(
      posterCandidatesSchema.safeParse(
        Array.from({ length: VIDEO_POSTER_CANDIDATE_CAP }, () => candidate)
      ).success
    ).toBe(true);
  });

  it('rejects a list over the cap', () => {
    expect(
      posterCandidatesSchema.safeParse(
        Array.from({ length: VIDEO_POSTER_CANDIDATE_CAP + 1 }, () => candidate)
      ).success
    ).toBe(false);
  });
});
