'use client';

import { useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import { Calendar, Edit, Eye, EyeOff, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import {
  deleteNotificationBannerAction,
  publishNotificationBannerAction,
  unpublishNotificationBannerAction,
} from '@/lib/actions/notification-banner-action';
import type { NotificationBanner } from '@/lib/services/notification-banner-service';

/**
 * Convert hex color to rgba with opacity
 */
const hexToRgba = (hex: string, opacity: number): string => {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(255, 255, 255, ${opacity})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

interface NotificationBannerListProps {
  notifications: NotificationBanner[];
}

export function NotificationBannerList({ notifications }: NotificationBannerListProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification banner?')) {
      return;
    }

    setIsDeleting(id);
    try {
      const result = await deleteNotificationBannerAction(id);
      if (result.success) {
        toast.success('Notification banner deleted successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to delete notification banner');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(null);
    }
  };

  const handlePublish = async (id: string) => {
    setIsPublishing(id);
    try {
      const result = await publishNotificationBannerAction(id);
      if (result.success) {
        toast.success('Notification banner published successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to publish notification banner');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsPublishing(null);
    }
  };

  const handleUnpublish = async (id: string) => {
    setIsPublishing(id);
    try {
      const result = await unpublishNotificationBannerAction(id);
      if (result.success) {
        toast.success('Notification banner unpublished successfully');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to unpublish notification banner');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsPublishing(null);
    }
  };

  if (notifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Notification Banners</CardTitle>
          <CardDescription>
            Create your first notification banner to display on the home page using the &quot;New
            Banner&quot; button above.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notifications.map((notification) => (
        <Card key={notification.id} className="overflow-hidden flex flex-col">
          {/* Banner Preview */}
          <div
            className="relative aspect-video w-full"
            style={{ backgroundColor: notification.backgroundColor || '#1a1a2e' }}
          >
            {/* Background image if exists - fallback to originalImageUrl if imageUrl is not available */}
            {(notification.imageUrl || notification.originalImageUrl) && (
              <Image
                src={notification.imageUrl || notification.originalImageUrl || ''}
                alt={notification.message}
                fill
                className="object-cover"
                style={{
                  objectPosition: `calc(50% + ${notification.imageOffsetX ?? 0}%) calc(50% + ${notification.imageOffsetY ?? 0}%)`,
                }}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                unoptimized
              />
            )}

            {/* Text overlay - show when isOverlayed is enabled (text is rendered dynamically, not burned in) */}
            {notification.isOverlayed && (
              <>
                {/* Main message */}
                <span
                  className="absolute px-1 text-center leading-tight"
                  style={{
                    left: `${notification.messagePositionX ?? 50}%`,
                    top: `${notification.messagePositionY ?? 10}%`,
                    transform: `translate(-50%, -50%) rotate(${notification.messageRotation ?? 0}deg)`,
                    maxWidth: '90%',
                    fontFamily:
                      notification.messageFont === 'system-ui'
                        ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        : `'${notification.messageFont}', system-ui, sans-serif`,
                    fontSize: `${notification.messageFontSize ?? 2.5}rem`,
                    color: hexToRgba(
                      notification.messageTextColor || '#ffffff',
                      (notification.messageContrast ?? 100) / 100
                    ),
                    textShadow:
                      notification.messageTextShadow &&
                      (notification.imageUrl || notification.originalImageUrl)
                        ? `0 1px 3px rgba(0,0,0,${0.4 + ((notification.messageTextShadowDarkness ?? 50) / 100) * 0.5})`
                        : notification.messageTextShadow
                          ? `0 1px 2px rgba(0,0,0,0.3)`
                          : 'none',
                    fontWeight: 'normal',
                  }}
                >
                  {notification.message}
                </span>

                {/* Secondary message */}
                {notification.secondaryMessage && (
                  <span
                    className="absolute px-1 text-center leading-tight"
                    style={{
                      left: `${notification.secondaryMessagePositionX ?? 50}%`,
                      top: `${notification.secondaryMessagePositionY ?? 90}%`,
                      transform: `translate(-50%, -50%) rotate(${notification.secondaryMessageRotation ?? 0}deg)`,
                      maxWidth: '90%',
                      fontFamily:
                        notification.secondaryMessageFont === 'system-ui'
                          ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                          : `'${notification.secondaryMessageFont}', system-ui, sans-serif`,
                      fontSize: `${notification.secondaryMessageFontSize ?? 2}rem`,
                      color: hexToRgba(
                        notification.secondaryMessageTextColor || '#ffffff',
                        (notification.secondaryMessageContrast ?? 95) / 100
                      ),
                      textShadow:
                        notification.secondaryMessageTextShadow &&
                        (notification.imageUrl || notification.originalImageUrl)
                          ? `0 1px 2px rgba(0,0,0,${0.3 + ((notification.secondaryMessageTextShadowDarkness ?? 50) / 100) * 0.5})`
                          : notification.secondaryMessageTextShadow
                            ? `0 1px 2px rgba(0,0,0,0.3)`
                            : 'none',
                      fontWeight: 'normal',
                    }}
                  >
                    {notification.secondaryMessage}
                  </span>
                )}
              </>
            )}

            {/* Status Badges Overlay */}
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {notification.publishedAt ? (
                <Badge variant="default" className="shadow-sm">
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary" className="shadow-sm">
                  Draft
                </Badge>
              )}
              {notification.isActive ? (
                <Badge
                  variant="outline"
                  className="bg-background/80 text-green-600 border-green-600 shadow-sm"
                >
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-background/80 text-zinc-500 shadow-sm">
                  Inactive
                </Badge>
              )}
            </div>

            {/* Sort Order Badge */}
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="shadow-sm">
                #{notification.sortOrder}
              </Badge>
            </div>
          </div>

          {/* Card Content */}
          <CardContent className="flex-1 p-4">
            <div className="space-y-2">
              {/* Message Preview - always show for easy identification */}
              <div>
                <p className="font-medium line-clamp-2">{notification.message}</p>
                {notification.secondaryMessage && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {notification.secondaryMessage}
                  </p>
                )}
              </div>

              {/* Display Period */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {notification.displayFrom
                    ? format(new Date(notification.displayFrom), 'MMM d')
                    : 'Any'}
                  {' - '}
                  {notification.displayUntil
                    ? format(new Date(notification.displayUntil), 'MMM d, yyyy')
                    : 'Ongoing'}
                </span>
              </div>

              {/* Notes */}
              {notification.notes && (
                <p className="text-xs text-muted-foreground italic line-clamp-1">
                  {notification.notes}
                </p>
              )}
            </div>
          </CardContent>

          {/* Card Footer with Actions */}
          <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/50">
            <span className="text-xs text-muted-foreground">
              Updated {format(new Date(notification.updatedAt), 'MMM d, yyyy')}
            </span>

            <div className="flex items-center gap-1">
              <Link href={`/admin/notifications/${notification.id}`}>
                <Button variant="ghost" size="sm">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {notification.publishedAt ? (
                    <DropdownMenuItem
                      onClick={() => handleUnpublish(notification.id)}
                      disabled={isPublishing === notification.id}
                    >
                      <EyeOff className="mr-2 h-4 w-4" />
                      {isPublishing === notification.id ? 'Unpublishing...' : 'Unpublish'}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => handlePublish(notification.id)}
                      disabled={isPublishing === notification.id}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {isPublishing === notification.id ? 'Publishing...' : 'Publish'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDelete(notification.id)}
                    disabled={isDeleting === notification.id}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting === notification.id ? 'Deleting...' : 'Delete'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
