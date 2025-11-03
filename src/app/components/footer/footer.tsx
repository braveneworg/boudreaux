import Link from 'next/link';

import VerticalSeparator from '../ui/vertical-separator';

const Footer = () => {
  const currentYear = 2025;

  return (
    <footer className="w-full bg-[url('/media/particles-4.svg')] bg-cover bg-center bg-no-repeat before:content-[''] before:absolute before:inset-0 before:opacity-90 before:pointer-events-none before:-z-10 relative">
      <div className="relative mx-auto w-full max-w-[1920px] py-1 mt-2 z-10">
        <div className="flex flex-col items-center justify-center gap-0 md:flex-row md:justify-between px-4 md:px-8">
          <p className="flex text-zinc-50 text-sm md:text-base">
            © {currentYear} Fake Four Inc.
            <VerticalSeparator className="h-4! mx-3" />
            All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center justify-center">
            <Link className="text-zinc-50 text-sm hover:underline px-2 py-1" href="/terms">
              Terms and Conditions
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link className="text-zinc-50 text-sm hover:underline px-2 py-1" href="/privacy">
              Privacy Policy
            </Link>
            <VerticalSeparator className="h-4!" />
            <Link className="text-zinc-50 text-sm hover:underline px-2 py-1" href="/cookies">
              Cookies Policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
