import Link from 'next/link';

import { getCdnUrl } from '@/lib/utils/cdn-utils';

import VerticalSeparator from '../ui/vertical-separator';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`w-full bg-zinc-950 bg-[url('${getCdnUrl('particles-6.svg')}')] bg-cover bg-center bg-no-repeat before:content-[''] before:absolute before:inset-0 before:opacity-90 before:pointer-events-none before:-z-10 relative`}
    >
      <div className="relative mx-auto w-full max-w-[1920px] py-1 mt-2 z-10">
        <div className="flex flex-col items-center justify-center gap-0 md:flex-row md:justify-between px-4 md:px-8">
          <div className="flex text-zinc-50 text-sm md:text-base">
            © {currentYear} Fake Four Inc.
            <VerticalSeparator className="h-4! mx-3" />
            All rights reserved.
          </div>
          <nav className="flex flex-wrap items-center justify-center">
            <Link
              className="text-zinc-50 text-sm hover:underline px-2 py-1"
              href="/legal/terms-and-conditions"
            >
              Terms and Conditions
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="text-zinc-50 text-sm hover:underline px-2 py-1"
              href="/legal/privacy-policy"
            >
              Privacy Policy
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link
              className="text-zinc-50 text-sm hover:underline px-2 py-1"
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
