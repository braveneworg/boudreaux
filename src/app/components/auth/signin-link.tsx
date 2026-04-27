/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { LogInIcon } from 'lucide-react';

const SignInLink = ({ onClick }: { onClick?: () => void }) => (
  <Link href="/signin" className="flex items-center gap-2 text-zinc-50 underline" onClick={onClick}>
    <LogInIcon size={18} className="mt-1" />
    Sign In
  </Link>
);

export default SignInLink;
