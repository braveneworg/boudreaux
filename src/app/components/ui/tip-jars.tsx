import Image from 'next/image';
import Link from 'next/link';

export const TipJarsLink = () => {
  return (
    <Link
      href="https://campsite.bio/ceschi"
      rel="noopener"
      target="_blank"
      className="mt-2 text-xl text-zinc-50 visited:text-zinc-50 pb-3 flex items-center justify-center"
    >
      Tip Jars
      <Image
        src="https://cdn.fakefourrecords.com/media/icons/external-link-icon.svg"
        className="ml-2 inline-block"
        alt="Tip Jars"
        width={22}
        height={22}
      />
    </Link>
  );
};
