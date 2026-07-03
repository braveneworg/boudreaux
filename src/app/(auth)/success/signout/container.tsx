/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { LogOut } from 'lucide-react';

import { ImageHeading } from '@/components/ui/image-heading';
import { ZinePanel } from '@/components/ui/zine-panel';
import { Button } from '@/ui/button';
import { Separator } from '@/ui/separator';

export const SuccessContainer = (): React.ReactElement => (
  <ZinePanel accent="kraft">
    <ImageHeading
      src="/media/headings/SUCCESS.webp"
      alt="success"
      imageHeight={480}
      imageClassName="w-full"
      priority
    />

    {/* Confirmation copy stays centered at its previous card width inside the
        full-width panel */}
    <div className="mx-auto w-full max-w-md">
      {/* Confirmation heading */}
      <div className="mb-1 flex items-center gap-2">
        <LogOut className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Signed out
        </p>
      </div>

      <h2 className="mb-4 text-xl font-bold tracking-tight">You're signed out.</h2>

      <Separator className="mb-4" />

      {/* Body copy */}
      <p className="text-muted-foreground mb-1 text-sm">You have been successfully signed out.</p>
      <p className="text-muted-foreground mb-6 text-sm">
        Close your browser to protect your privacy.
      </p>

      {/* Primary CTA */}
      <Button asChild size="lg" className="w-full">
        <Link href="/signin">Sign back in</Link>
      </Button>

      {/* Secondary link */}
      <p className="text-muted-foreground mt-4 text-center text-sm">
        <Link href="/" className="font-semibold underline underline-offset-4 hover:no-underline">
          Go to homepage
        </Link>
      </p>
    </div>
  </ZinePanel>
);
