'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { Check, ChevronsUpDown, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { getArtistImagesAction } from '@/lib/actions/artist-image-actions';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { cn } from '@/lib/utils';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

import type { Control, FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form';

interface ArtistImageOption {
  id: string;
  src: string;
  artistId: string;
  artistName: string;
  caption?: string;
  altText?: string;
}

interface CoverArtFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  setValue: UseFormSetValue<TFieldValues>;
  artistIds: string[];
  disabled?: boolean;
  entityType?: 'artists' | 'groups' | 'releases' | 'tracks' | 'notifications' | 'featured-artists';
}

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function CoverArtField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  setValue,
  artistIds,
  disabled = false,
  entityType = 'releases',
}: CoverArtFieldProps<TFieldValues, TName>) {
  const [isUploading, setIsUploading] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [artistImages, setArtistImages] = useState<ArtistImageOption[]>([]);
  const [isLoadingArtistImages, setIsLoadingArtistImages] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Fetch artist images when selected artists change
  const artistIdsKey = JSON.stringify([...artistIds].sort());

  useEffect(() => {
    const parsedIds: string[] = JSON.parse(artistIdsKey);

    if (parsedIds.length === 0) {
      setArtistImages([]);
      return;
    }

    let cancelled = false;

    const fetchArtistImages = async () => {
      setIsLoadingArtistImages(true);
      try {
        const allImages: ArtistImageOption[] = [];

        for (const artistId of parsedIds) {
          const [artistResponse, imagesResult] = await Promise.all([
            fetch(`/api/artists/${artistId}`),
            getArtistImagesAction(artistId),
          ]);

          let artistName = 'Unknown Artist';
          if (artistResponse.ok) {
            const artist = await artistResponse.json();
            artistName =
              artist.displayName ||
              [artist.firstName, artist.surname].filter(Boolean).join(' ') ||
              'Unknown Artist';
          }

          if (imagesResult.success && imagesResult.data) {
            for (const img of imagesResult.data) {
              allImages.push({
                id: img.id,
                src: img.src,
                artistId,
                artistName,
                caption: img.caption,
                altText: img.altText,
              });
            }
          }
        }

        if (!cancelled) {
          setArtistImages(allImages);
        }
      } catch (err) {
        console.error('Failed to fetch artist images:', err);
      } finally {
        if (!cancelled) {
          setIsLoadingArtistImages(false);
        }
      }
    };

    fetchArtistImages();
    return () => {
      cancelled = true;
    };
  }, [artistIdsKey]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const processFile = useCallback(
    async (file: File) => {
      if (!VALID_IMAGE_TYPES.includes(file.type)) {
        toast.error('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Image must be less than 50MB');
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      setLocalPreviewUrl(blobUrl);
      setIsUploading(true);

      try {
        const tempEntityId = crypto.randomUUID();
        const presignedResult = await getPresignedUploadUrlsAction(entityType, tempEntityId, [
          {
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size,
          },
        ]);

        if (!presignedResult.success || !presignedResult.data?.[0]) {
          throw new Error(presignedResult.error || 'Failed to get upload URL');
        }

        const uploadResult = await uploadFileToS3(file, presignedResult.data[0]);
        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        setValue(name, uploadResult.cdnUrl as TFieldValues[TName], {
          shouldDirty: true,
          shouldValidate: true,
        });

        URL.revokeObjectURL(blobUrl);
        setLocalPreviewUrl('');
        toast.success('Cover art uploaded');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
        toast.error(errorMessage);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [entityType, name, setValue]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Cover Art *</FormLabel>

          {/* Preview */}
          {(field.value || localPreviewUrl) && (
            <div className="relative h-40 w-40 overflow-hidden rounded-lg border group">
              <Image
                src={localPreviewUrl || (field.value as string)}
                alt="Cover art"
                fill
                className="object-cover"
                unoptimized={!!(localPreviewUrl && localPreviewUrl.startsWith('blob:'))}
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isUploading && !disabled && (
                <button
                  type="button"
                  onClick={() => {
                    setValue(name, '' as TFieldValues[TName], {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    if (localPreviewUrl) {
                      URL.revokeObjectURL(localPreviewUrl);
                      setLocalPreviewUrl('');
                    }
                  }}
                  className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-destructive/90 text-destructive-foreground shadow-sm transition-opacity hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Remove cover art"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Upload drop zone */}
          <FormControl>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragOver(false);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors',
                isDragOver && 'border-primary bg-primary/5',
                !isDragOver && 'border-muted-foreground/25 hover:border-muted-foreground/50',
                (disabled || isUploading) && 'cursor-not-allowed opacity-50'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={VALID_IMAGE_TYPES.join(',')}
                onChange={handleFileSelect}
                disabled={disabled || isUploading}
                className="hidden"
                aria-label="Upload cover art"
              />
              {isUploading ? (
                <>
                  <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </>
              ) : (
                <>
                  <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-center text-sm">
                    <span className="font-medium text-foreground">Click to upload</span> or drag and
                    drop
                  </p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF up to 50MB</p>
                </>
              )}
            </div>
          </FormControl>

          {/* Artist image combobox */}
          {artistIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Or select from artist images:</p>
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="w-full justify-between"
                    disabled={disabled || isUploading || isLoadingArtistImages}
                  >
                    {isLoadingArtistImages
                      ? 'Loading artist images...'
                      : field.value && artistImages.find((img) => img.src === field.value)
                        ? artistImages.find((img) => img.src === field.value)!.artistName +
                          ' - image selected'
                        : 'Choose from artist images...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search artist images..." />
                    <CommandEmpty>
                      {isLoadingArtistImages
                        ? 'Loading artist images...'
                        : 'No artist images found.'}
                    </CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {artistImages.map((img) => (
                          <CommandItem
                            key={img.id}
                            value={img.id}
                            onSelect={() => {
                              setValue(name, img.src as TFieldValues[TName], {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              if (localPreviewUrl) {
                                URL.revokeObjectURL(localPreviewUrl);
                                setLocalPreviewUrl('');
                              }
                              setComboboxOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 shrink-0',
                                field.value === img.src ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="relative mr-2 h-8 w-8 shrink-0 overflow-hidden rounded">
                              <Image
                                src={img.src}
                                alt={img.altText || img.caption || 'Artist image'}
                                fill
                                className="object-cover"
                                sizes="32px"
                                unoptimized
                              />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm">{img.artistName}</span>
                              {img.caption && (
                                <span className="truncate text-xs text-muted-foreground">
                                  {img.caption}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}
