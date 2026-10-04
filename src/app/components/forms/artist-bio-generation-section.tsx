/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { Link2, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { BioHtml } from '@/app/components/bio-html';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Textarea } from '@/app/components/ui/textarea';
import { cn } from '@/lib/utils';
import { deriveBioLinkLabel } from '@/lib/utils/derive-bio-link-label';
import { isHttpUrl } from '@/lib/utils/is-http-url';
import type {
  BioGenerationStatusResponse,
  BioProgress,
  GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { useGenerateArtistBioMutation } from './_hooks/mutations/use-bio-mutations';
import { useArtistBioGenerationStatusQuery } from './_hooks/use-artist-bio-generation-status-query';
import { useArtistPool } from './_hooks/use-artist-pool';
import { useJobRun } from './_hooks/use-job-run';
import { BioGenerationProgressTimeline } from './bio-generation-progress-timeline';

interface ArtistBioGenerationSectionProps {
  artistId: string;
  /** Called with the sanitized result so the parent form can populate fields. */
  onGenerated: (content: GeneratedBioContent) => void;
}

/** A reference link added this session: the URL the next run reads, and the stored row it became. */
interface ReferenceLink {
  url: string;
  /** The persisted palette row's id, once the create resolved. */
  linkId: string | null;
}

interface ReferenceLinksListProps {
  links: ReferenceLink[];
  onRemove: (link: ReferenceLink) => void;
}

const ReferenceLinksList = ({ links, onRemove }: ReferenceLinksListProps) => (
  <ul className="flex flex-wrap gap-2">
    {links.map((link) => (
      <li key={link.url}>
        <Badge variant="secondary" className="gap-1">
          <Link2 className="size-3" aria-hidden />
          <span className="max-w-48 truncate">{link.url}</span>
          <button
            type="button"
            onClick={() => onRemove(link)}
            aria-label={`Remove ${link.url}`}
            className="hover:text-destructive ml-1"
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      </li>
    ))}
  </ul>
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

interface BioGeneratingSkeletonProps {
  /** Latest polled progress checkpoint driving the live stage timeline. */
  progress: BioProgress | null | undefined;
}

const BioGeneratingSkeleton = ({ progress }: BioGeneratingSkeletonProps) => (
  <div className="space-y-3">
    <BioGenerationProgressTimeline progress={progress} />
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

    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Trash2 className="size-3" aria-hidden />
      Regenerating replaces the palette images and links.
    </p>
  </div>
);

/**
 * Admin tool that generates an artist's short + long bio plus discovered images
 * and links via the bio-generator Lambda. Reference links and the description
 * are optional context. Renders a short-bio preview only — the discovered media
 * is rendered by the palettes elsewhere on the page — and supports regenerating
 * when the admin is unhappy with the result.
 *
 * @param artistId - The artist to generate for (edit mode only).
 * @param onGenerated - Receives the sanitized content to populate the form.
 */
export const ArtistBioGenerationSection = ({
  artistId,
  onGenerated,
}: ArtistBioGenerationSectionProps) => {
  const [links, setLinks] = useState<ReferenceLink[]>([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<GeneratedBioContent | null>(null);
  const { generateArtistBioAsync } = useGenerateArtistBioMutation();
  const { addLink: addStoredLink, removeLink: removeStoredLink } = useArtistPool(artistId);
  // Always enabled: a run in flight after a reload is found and resumed.
  const status = useArtistBioGenerationStatusQuery(artistId);

  // Generation runs in the background; the tracker surfaces its terminal
  // status once. On success we populate the form from the polled content —
  // which the job has already persisted, so there is nothing left to Save;
  // the parent toasts, naming any field it kept.
  const onSucceeded = useCallback(
    (data: BioGenerationStatusResponse): void => {
      if (!data.content) return;
      setResult(data.content);
      onGenerated(data.content);
    },
    [onGenerated]
  );
  const onFailed = useCallback((message: string): void => {
    toast.error(message);
  }, []);
  const trigger = useCallback(
    () =>
      generateArtistBioAsync({
        artistId,
        links: links.length ? links.map(({ url }) => url) : undefined,
        description: description.trim() || undefined,
      }),
    [generateArtistBioAsync, artistId, links, description]
  );
  const run = useJobRun({
    query: status,
    trigger,
    onSucceeded,
    onFailed,
    defaultFailure: 'Bio generation failed.',
  });
  const isPending = run.busy;

  const addLink = (): void => {
    const candidate = linkDraft.trim();
    if (!candidate) return;
    if (!isHttpUrl(candidate)) {
      toast.error('Links must start with http:// or https://');
      return;
    }
    if (links.some(({ url }) => url === candidate)) {
      setLinkDraft('');
      return;
    }
    setLinks((prev) => [...prev, { url: candidate, linkId: null }]);
    setLinkDraft('');
    // Persist the reference link as a custom palette row so it is draggable
    // into the editors and survives reload; it still seeds the next
    // generation via `links`. The pill then IS that row: removing the pill
    // removes the row. (The service dedupes; errors toast from the pool.)
    void addStoredLink({ artistId, label: deriveBioLinkLabel(candidate), url: candidate }).then(
      (row) => {
        if (row) {
          setLinks((prev) =>
            prev.map((link) => (link.url === candidate ? { ...link, linkId: row.id } : link))
          );
        }
      }
    );
  };

  const removeLink = ({ url, linkId }: ReferenceLink): void => {
    setLinks((prev) => prev.filter((link) => link.url !== url));
    if (linkId) removeStoredLink(linkId);
  };

  return (
    <section className="border-primary/40 bg-primary/5 space-y-4 border border-dashed p-4">
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
        onGenerate={() => void run.start()}
      />

      {isPending && <BioGeneratingSkeleton progress={status.data?.progress} />}

      {result && !isPending && <BioResultPreview result={result} />}
    </section>
  );
};
