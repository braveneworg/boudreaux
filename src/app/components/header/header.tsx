import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { userAgentFromString } from 'next/server'; // For App Router

const Header = async () => {
  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';

  return (
    <div className="md:fixed z-[100] opacity-95 w-screen bg-zinc-950 url('/media/stardust.svg') bg-cover bg-center">
      <div className="mx-auto w-full max-w-[1920px] px-2 md:px-8 py-2 md:py-4">
        <header className="flex h-[30px] md:h-[144px] w-full justify-between 2xl:min-w-[1864px]">
          <Link className="block" href="/">
            <Image
              alt="Fake Four Inc. Logo"
              className="mt-0 size-[33px] md:size-[144px] rounded-full border-2 border-solid border-zinc-900 bg-white p-0"
              height={100}
              priority
              src={
                isMobile
                  ? '/media/fake-four-inc-black-hand-logo.svg'
                  : '/media/fake-four-inc-black-stardust-hand-logo.svg'
              }
              width={100}
            />
            {isMobile && (
              <Image
                alt="Fake Four Inc. Words"
                className="absolute w-[244px] top-0 right-8 inline-block ml-2"
                height={44}
                src="/media/fake-four-inc-words.png"
                width={444}
              />
            )}
          </Link>
        </header>
      </div>
    </div>
  );
};

export default Header;
