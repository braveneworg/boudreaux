/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import manifest from './manifest';

describe('manifest', () => {
  it('describes an installable standalone app rooted at the origin', () => {
    const result = manifest();

    expect(result.name).toBe('Fake Four Inc.');
    expect(result.short_name).toBe('Fake Four Inc.');
    expect(result.start_url).toBe('/');
    expect(result.scope).toBe('/');
    expect(result.display).toBe('standalone');
  });

  it('declares both 192 and 512 "any" icons required for installability', () => {
    const result = manifest();
    const anyIcons = result.icons?.filter((icon) => icon.purpose === 'any') ?? [];

    expect(anyIcons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    );
  });

  it('declares maskable icons so Android applies its adaptive mask cleanly', () => {
    const result = manifest();
    const maskableIcons = result.icons?.filter((icon) => icon.purpose === 'maskable') ?? [];

    expect(maskableIcons).toHaveLength(2);
    expect(maskableIcons.every((icon) => icon.type === 'image/png')).toBe(true);
  });
});
