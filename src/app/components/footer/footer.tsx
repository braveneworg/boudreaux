/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import VerticalSeparator from '../ui/vertical-separator';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative min-h-23 w-full bg-zinc-950 bg-[url('/media/particles-6.svg')] bg-cover bg-center bg-no-repeat before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-90 before:content-['']">
      <div className="relative z-10 mx-auto mt-2 w-full max-w-480 py-1">
        <div className="flex flex-col items-center justify-center gap-0 px-4 md:flex-row md:justify-between md:px-8">
          <div className="flex text-sm text-zinc-50 md:text-base">
            © {currentYear} Fake Four Inc.
            <VerticalSeparator className="mx-3 h-4!" />
            All rights reserved.
          </div>
          <nav className="flex flex-wrap items-center justify-center">
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/terms-and-conditions"
            >
              Terms and Conditions
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/privacy-policy"
            >
              Privacy Policy
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="px-2 py-1 text-sm text-zinc-50 hover:underline"
              href="/legal/cookies-policy"
            >
              Cookies Policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
