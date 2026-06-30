/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';

import { ExternalLink, Link2, Plus, RefreshCw, Sparkles, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { BioHtml } from '@/app/components/bio-html';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Textarea } from '@/app/components/ui/textarea';
import { useGenerateArtistBioMutation } from '@/app/hooks/mutations/use-bio-mutations';
import { useArtistBioGenerationStatusQuery } from '@/app/hooks/use-artist-bio-generation-status-query';
import { cn } from '@/lib/utils';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

interface ArtistBioGenerationSectionProps {
  artistId: string;
  /** Called with the sanitized result so the parent form can populate fields. */
  onGenerated: (content: GeneratedBioContent) => void;
}

interface ReferenceLinksListProps {
  links: string[];
  onRemove: (url: string) => void;
}

const ReferenceLinksList = ({ links, onRemove }: ReferenceLinksListProps) => (
  <ul className="flex flex-wrap gap-2">
    {links.map((url) => (
      <li key={url}>
        <Badge variant="secondary" className="gap-1">
          <Link2 className="size-3" aria-hidden />
          <span className="max-w-48 truncate">{url}</span>
          <button
            type="button"
            onClick={() => onRemove(url)}
            aria-label={`Remove ${url}`}
            className="hover:text-destructive ml-1 rounded-full"
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      </li>
    ))}
  </ul>
);

interface DiscoveredImagesProps {
  images: GeneratedBioContent['images'];
}

const DiscoveredImages = ({ images }: DiscoveredImagesProps) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold">Discovered images</h3>
    <ul className="flex flex-wrap gap-3">
      {images.map((image) => (
        <li key={image.url} className="relative">
          <Image
            src={image.thumbnailUrl ?? image.url}
            alt={image.title ?? 'Discovered artist image'}
            width={80}
            height={80}
            unoptimized
            className="ring-border size-20 rounded-md object-cover ring-1"
          />
          {image.isPrimary && (
            <Star
              className="absolute -top-1 -right-1 size-4 fill-yellow-400 text-yellow-500"
              aria-label="Primary image"
            />
          )}
        </li>
      ))}
    </ul>
    <p className="text-muted-foreground text-xs">
      Starred images are shown beside the short bio on the public pages.
    </p>
  </div>
);

interface DiscoveredLinksProps {
  links: GeneratedBioContent['links'];
}

const DiscoveredLinks = ({ links }: DiscoveredLinksProps) => (
  <div role="group" aria-label="Discovered links" className="space-y-2">
    <h3 className="text-sm font-semibold">Discovered links</h3>
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.url} className="flex items-center gap-2 text-sm">
          <ExternalLink className="text-muted-foreground size-3.5" aria-hidden />
          <a
            href={link.url}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="text-primary truncate hover:underline"
          >
            {link.label}
          </a>
          {link.kind && (
            <Badge variant="outline" className="text-xs">
              {link.kind}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  </div>
);

interface GenerateBioButtonProps {
  hasResult: boolean;
  isPending: boolean;
  onGenerate: () => void;
}

const GenerateBioButton = ({ hasResult, isPending, onGenerate }: GenerateBioButtonProps) => (
  <Button type="button" onClick={onGenerate} disabled={isPending} className="w-full sm:w-auto">
    {hasResult ? (
      <RefreshCw className={cn('size-4', isPending && 'animate-spin')} aria-hidden />
    ) : (
      <Sparkles className={cn('size-4', isPending && 'animate-pulse')} aria-hidden />
    )}
    {isPending ? 'Generating…' : hasResult ? 'Regenerate bios' : 'Generate bios'}
  </Button>
);

const BioGeneratingSkeleton = () => (
  <div className="space-y-2">
    <p className="text-muted-foreground text-sm" role="status">
      Researching the web and writing the bio — this can take a few minutes. You can keep working;
      the results will appear here when ready.
    </p>
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-20 w-full" />
    </div>
  </div>
);

interface BioResultPreviewProps {
  result: GeneratedBioContent;
}

const BioResultPreview = ({ result }: BioResultPreviewProps) => (
  <div className="space-y-4 border-t pt-4">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">Short bio</h3>
      <BioHtml html={result.shortBio} className="text-muted-foreground text-sm" />
    </div>

    {result.images.length > 0 && <DiscoveredImages images={result.images} />}

    {result.links.length > 0 && <DiscoveredLinks links={result.links} />}

    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Trash2 className="size-3" aria-hidden />
      Regenerating replaces the images and links above. Save the form to keep the result.
    </p>
  </div>
);

/**
 * Admin tool that generates an artist's short + long bio plus discovered images
 * and links via the bio-generator Lambda. Reference links and the description
 * are optional context. Renders a preview of the discovered media and supports
 * regenerating when the admin is unhappy with the result.
 *
 * @param artistId - The artist to generate for (edit mode only).
 * @param onGenerated - Receives the sanitized content to populate the form.
 */
export const ArtistBioGenerationSection = ({
  artistId,
  onGenerated,
}: ArtistBioGenerationSectionProps) => {
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<GeneratedBioContent | null>(null);
  // `active` is true from the moment we trigger generation until we handle its
  // terminal status — it both gates status polling and keeps the UI in the
  // working state across the (minutes-long) background job.
  const [active, setActive] = useState(false);
  const { generateArtistBioAsync, isGeneratingArtistBio } = useGenerateArtistBioMutation();
  const status = useArtistBioGenerationStatusQuery(artistId, { enabled: active });

  // Generation runs in the background; surface its terminal status once. On
  // success we populate the form from the polled content; on failure we toast.
  useEffect(() => {
    if (!active || !status.data) return;
    if (status.data.status === 'succeeded' && status.data.content) {
      setResult(status.data.content);
      onGenerated(status.data.content);
      toast.success('Bios generated — review below, then Save to keep them.');
      setActive(false);
    } else if (status.data.status === 'failed') {
      toast.error(status.data.error || 'Bio generation failed.');
      setActive(false);
    }
  }, [active, status.data, onGenerated]);

  // Disable inputs while triggering or while a background job is in flight.
  const isPending = isGeneratingArtistBio || active;

  const addLink = (): void => {
    const candidate = linkDraft.trim();
    if (!candidate) return;
    if (!isHttpUrl(candidate)) {
      toast.error('Links must start with http:// or https://');
      return;
    }
    setLinks((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]));
    setLinkDraft('');
  };

  const removeLink = (url: string): void => {
    setLinks((prev) => prev.filter((link) => link !== url));
  };

  const generate = async (): Promise<void> => {
    const response = await generateArtistBioAsync({
      artistId,
      links: links.length ? links : undefined,
      description: description.trim() || undefined,
    });

    if (!response.success) {
      toast.error(response.error);
      return;
    }

    // Generation now runs in the background — start polling for completion.
    setActive(true);
  };

  return (
    <section className="border-primary/40 bg-primary/5 space-y-4 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary size-5" aria-hidden />
        <h2 className="font-semibold">AI Bio Generation</h2>
      </div>
      <p className="text-muted-foreground text-sm">
        Generate a short and long bio from the artist&apos;s name, plus images and links discovered
        from public music databases. Reference links and notes below are optional.
      </p>

      <div className="space-y-2">
        <Label htmlFor="bio-gen-link">Reference links (optional)</Label>
        <div className="flex gap-2">
          <Input
            id="bio-gen-link"
            type="url"
            inputMode="url"
            placeholder="https://example.com/artist"
            value={linkDraft}
            disabled={isPending}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addLink();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addLink}
            disabled={isPending || !linkDraft.trim()}
          >
            <Plus className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Add</span>
          </Button>
        </div>
        {links.length > 0 && <ReferenceLinksList links={links} onRemove={removeLink} />}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio-gen-description">Additional description (optional)</Label>
        <Textarea
          id="bio-gen-description"
          placeholder="Anything the model should know — sound, influences, scene, hometown…"
          className="min-h-20"
          maxLength={2000}
          value={description}
          disabled={isPending}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <GenerateBioButton
        hasResult={result !== null}
        isPending={isPending}
        onGenerate={() => void generate()}
      />

      {isPending && <BioGeneratingSkeleton />}

      {result && !isPending && <BioResultPreview result={result} />}
    </section>
  );
};
