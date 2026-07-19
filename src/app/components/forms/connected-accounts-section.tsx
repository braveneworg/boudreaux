/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { toast } from 'sonner';

import {
  AppleIcon,
  FacebookIcon,
  GoogleIcon,
  XIcon,
  type BrandIconProps,
} from '@/app/components/ui/brand-icons';
import { authClient } from '@/lib/auth-client';
import { log } from '@/lib/utils/console-logger';
import { reportClientError } from '@/lib/utils/report-client-error';
import { Alert, AlertDescription } from '@/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/ui/alert-dialog';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Separator } from '@/ui/separator';
import { Skeleton } from '@/ui/skeleton';
import { ZinePanel } from '@/ui/zine-panel';

import { useConnectedAccounts } from './_hooks/use-connected-accounts';

type SocialProvider = 'apple' | 'google' | 'facebook' | 'twitter';

interface ProviderConfig {
  provider: SocialProvider;
  providerId: string;
  label: string;
  Icon: (props: BrandIconProps) => React.ReactElement;
}

const PROVIDERS: ProviderConfig[] = [
  { provider: 'apple', providerId: 'apple', label: 'Apple', Icon: AppleIcon },
  { provider: 'google', providerId: 'google', label: 'Google', Icon: GoogleIcon },
  { provider: 'facebook', providerId: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  { provider: 'twitter', providerId: 'twitter', label: 'X (Twitter)', Icon: XIcon },
];

/**
 * Profile panel showing all 4 social providers with their link/unlink status.
 * Calls `authClient.linkSocial` to initiate OAuth redirect, and
 * `authClient.unlinkAccount` (behind an AlertDialog confirm) to disconnect.
 */
export const ConnectedAccountsSection = (): React.ReactElement => {
  const { accounts, isLoading, error, refetch } = useConnectedAccounts();

  const linkedProviderIds = new Set((accounts ?? []).map((a) => a.providerId));

  const handleLink = (provider: SocialProvider): void => {
    void authClient.linkSocial({ provider, callbackURL: '/profile' });
  };

  const handleUnlink = async (providerId: string, label: string): Promise<void> => {
    try {
      const { error: unlinkError } = await authClient.unlinkAccount({ providerId });
      if (unlinkError !== null && unlinkError !== undefined) {
        const err = unlinkError instanceof Error ? unlinkError : new Error(String(unlinkError));
        toast.error(`Failed to disconnect from ${label}`);
        reportClientError(err, 'route');
        return;
      }
      toast.success(`Disconnected from ${label}`);
      log('info', `Disconnected from ${label}`);
      await refetch();
    } catch (thrown: unknown) {
      const err = thrown instanceof Error ? thrown : new Error(String(thrown));
      toast.error(`Failed to disconnect from ${label}`);
      reportClientError(err, 'route');
    }
  };

  return (
    <ZinePanel accent="kraft">
      <h2 className="font-fake-four-cutout mb-4 text-2xl tracking-wide text-black uppercase">
        Social accounts
      </h2>

      <Separator className="mb-4" />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isLoading && error === null && (
        <div>
          {PROVIDERS.map(({ provider, providerId, label, Icon }) => {
            const isLinked = linkedProviderIds.has(providerId);

            return (
              <div key={provider} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                  {isLinked ? (
                    <Badge variant="secondary">Connected</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not connected</span>
                  )}
                </div>

                {isLinked ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Unlink
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You can reconnect it at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleUnlink(providerId, label)}>
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleLink(provider)}>
                    Link
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ZinePanel>
  );
};
