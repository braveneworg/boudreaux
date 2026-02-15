/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { LogInIcon } from 'lucide-react';

const SignInLink = ({ onClick }: { onClick?: () => void }) => (
  <Link
    href="/signin"
    className="flex text-zinc-50 underline items-center gap-2 text-sm"
    onClick={onClick}
  >
    <LogInIcon size={16} />
    Sign In
  </Link>
);

export default SignInLink;
