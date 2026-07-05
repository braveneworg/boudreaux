/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createBioImageInputSchema,
  updateBioImageAttributionInputSchema,
} from './bio-image-input-schema';

const validCreate = {
  artistId: '507f1f77bcf86cd799439011',
  url: 'https://cdn.example/x.webp',
  attribution: 'Uploaded by admin',
};

describe('createBioImageInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(createBioImageInputSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a missing attribution', () => {
    const { attribution: _attribution, ...rest } = validCreate;
    expect(createBioImageInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-ObjectId artistId', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, artistId: 'nope' }).success).toBe(
      false
    );
  });

  it('rejects a non-url image url', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, url: 'not-a-url' }).success).toBe(
      false
    );
  });
});

describe('updateBioImageAttributionInputSchema', () => {
  const imageId = '507f1f77bcf86cd799439011';

  it('accepts a text attribution', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: 'New credit' }).success
    ).toBe(true);
  });

  it('accepts a null attribution (clearing)', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: null }).success
    ).toBe(true);
  });

  it('rejects a non-ObjectId imageId', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId: 'nope', attribution: 'x' }).success
    ).toBe(false);
  });
});
