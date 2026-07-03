/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's built-in box-shadow scale, so the
 * custom `--shadow-zine*` theme tokens (globals.css) fall through to the
 * shadow-color group and never conflict with real box-shadow utilities —
 * e.g. `twMerge('shadow-zine', 'shadow-none')` keeps both classes.
 * Registering the zine utilities in the `shadow` class group makes
 * conflicting box-shadow classes resolve deterministically (last wins).
 */
export const twMergeZine = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: ['shadow-zine', 'shadow-zine-md', 'shadow-zine-sm', 'shadow-zine-ink'],
    },
  },
});
