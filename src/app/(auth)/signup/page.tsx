/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { enabledSocialProviders } from '@/lib/config/runtime-config';

import { SignupPage } from './signup-page';

/**
 * `/signup` (and `/signin` by rewrite). A server component so it can decide,
 * from the same credentials better-auth registered, which social buttons the
 * client page offers — only the provider ids cross to the client, never a
 * secret.
 */
export default function SignupRoute() {
  return <SignupPage socialProviders={enabledSocialProviders()} />;
}
