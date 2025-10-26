import Link from 'next/link';

import { ShieldUser as ShieldUserIcon } from 'lucide-react';

const AdminLink = () => {
  return (
    <Link className="flex items-center gap-2 text-sm underline-offset-4" href="/admin">
      <ShieldUserIcon className="h-4 w-4" />
      Admin
    </Link>
  );
};

export default AdminLink;
