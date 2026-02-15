/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { ShieldUser as ShieldUserIcon } from 'lucide-react';

const AdminLink = ({ onClick }: { onClick?: () => void }) => {
  return (
    <Link
      className="text-zinc-50 underline flex items-center gap-2 text-sm underline-offset-4"
      href="/admin"
      onClick={onClick}
    >
      <ShieldUserIcon className="h-4 w-4" />
      Admin
    </Link>
  );
};

export default AdminLink;
