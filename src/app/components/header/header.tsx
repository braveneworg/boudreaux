import Image from 'next/image';
import Link from 'next/link';

const Header = () => (
  <div className="md:fixed z-[100] opacity-95">
    <div className="mx-auto max-w-[1920px] px-8">
      <header className="flex h-[144px] w-full justify-between 2xl:min-w-[1864px] bg-zinc-950 url('/media/stardust.svg') bg-cover bg-center">
        <Link className="block self-center" href="/">
          <Image
            alt="Fake Four Inc. Logo"
            className="mt-0 size-[144px] rounded-full border-2 border-solid border-zinc-900 bg-white p-0"
            height={144}
            priority
            src="/media/fake-four-inc-black-stardust-hand-logo.svg"
            width={144}
          />
        </Link>
      </header>
    </div>
  </div>
);

export default Header;
