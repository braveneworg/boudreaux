import { Separator } from './ui/separator';

export const ArtistReleaseInfo = ({ artistName, title }: { artistName: string; title: string }) => (
  <>
    <article className="flex flex-col justify-center text-sm gap-1 items-center px-2 -mb-1.5">
      <h2
        className="sr-only text-lg font-semibold"
        aria-label={`Now playing: ${artistName} - ${title}`}
      >
        {artistName}
      </h2>
      <p>
        <em>{title}</em>
      </p>
    </article>
    <Separator className="bg-zinc-300 mx-auto mt-3 mb-1 min-h-px max-h-px max-w-[calc(100%-2rem)]" />
  </>
);
