/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';

// Interaction-only, so it is never server-rendered; the fallback reserves its
// footprint so the row does not jump when the chunk lands.
const SocialShareWidget = nextDynamic(
  () =>
    import('@/app/components/social-share-widget').then((mod) => ({
      default: mod.SocialShareWidget,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-8 min-h-8 w-36 animate-pulse" />,
  }
);

interface SubmissionShareProps {
  submissionId: string;
  title: string;
}

/**
 * The share row on a public submission: a button that copies its link, then
 * the social networks. Every share points at the submission's own page, whose
 * address holds only its id, so no edit or rename breaks a shared link.
 */
export const SubmissionShare = ({ submissionId, title }: SubmissionShareProps) => {
  const host = process.env.NEXT_PUBLIC_HOST_NAME ?? 'https://fakefourrecords.com';
  const url = `${host}/community/${submissionId}`;

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link. Copy it from the address bar.');
    }
  };

  return (
    <div
      role="group"
      aria-label={`Share ${title}`}
      className="mt-8 flex flex-wrap items-center gap-3"
    >
      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
        <Link2 aria-hidden="true" />
        Copy link
      </Button>
      <SocialShareWidget url={url} />
    </div>
  );
};
