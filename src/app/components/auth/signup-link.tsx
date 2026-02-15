/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { UserPlus } from 'lucide-react';

const SignUpLink = ({ onClick }: { onClick?: () => void }) => (
  <Link
    href="/signup"
    className="flex text-zinc-50 underline items-center gap-2 text-sm"
    onClick={onClick}
  >
    <UserPlus size={16} />
    Sign Up
  </Link>
);

export default SignUpLink;
