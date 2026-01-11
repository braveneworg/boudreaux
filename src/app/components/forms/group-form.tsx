'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/app/components/ui/form';
import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { createGroupAction } from '@/lib/actions/create-group-action';
import {
  deleteGroupImageAction,
  reorderGroupImagesAction,
  uploadGroupImagesAction,
} from '@/lib/actions/group-image-actions';
import { addGroupMemberAction, removeGroupMemberAction } from '@/lib/actions/group-member-actions';
import { updateGroupAction } from '@/lib/actions/update-group-action';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';
import { error } from '@/lib/utils/console-logger';
import { createGroupSchema } from '@/lib/validation/create-group-schema';
import type { GroupFormData } from '@/lib/validation/create-group-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof GroupFormData;

interface GroupFormProps {
  groupId?: string;
}

interface ArtistImage {
  id: string;
  src: string;
  sortOrder?: number;
}

interface GroupMember {
  id: string;
  artistId: string;
  artist: {
    id: string;
    firstName: string;
    surname: string;
    displayName: string | null;
    images?: ArtistImage[];
  };
}

interface ArtistOption {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  images?: ArtistImage[];
}

/**
 * Get display name for an artist - uses displayName if available, otherwise firstName + surname
 */
const getArtistDisplayName = (artist: {
  firstName: string;
  surname: string;
  displayName: string | null;
}): string => {
  return artist.displayName || `${artist.firstName} ${artist.surname}`;
};

/**
 * Get initials for avatar fallback
 */
const getArtistInitials = (artist: { firstName: string; surname: string }): string => {
  return `${artist.firstName.charAt(0)}${artist.surname.charAt(0)}`.toUpperCase();
};

/**
 * Get the first image URL for an artist
 */
const getArtistThumbnail = (artist: { images?: ArtistImage[] }): string | undefined => {
  return artist.images?.[0]?.src;
};

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ name }: { name: string }) => (
  <>
    Group <b>{name}</b> created successfully.
  </>
);

const UpdatedToastContent = ({ name }: { name: string }) => (
  <>
    Group <b>{name}</b> saved successfully.
  </>
);

const PublishedToastContent = ({ name }: { name: string }) => (
  <>
    Group <b>{name}</b> published successfully.
  </>
);

export default function GroupForm({ groupId: initialGroupId }: GroupFormProps) {
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createGroupAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isLoadingGroup, setIsLoadingGroup] = useState(!!initialGroupId);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId || null);
  const [isPublished, setIsPublished] = useState(false);
  const [imagesReordered, setImagesReordered] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [artistSearchResults, setArtistSearchResults] = useState<ArtistOption[]>([]);
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const [artistSearchOpen, setArtistSearchOpen] = useState(false);
  const [membersChanged, setMembersChanged] = useState(false);
  const isEditMode = groupId !== null;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);
  const groupForm = useForm<GroupFormData>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: '',
      displayName: '',
      bio: '',
      shortBio: '',
      formedOn: '',
      endedOn: '',
      createdBy: user?.id,
      publishedOn: '',
    },
  });
  const { control } = groupForm;

  // Fetch group data when initialGroupId is provided
  useEffect(() => {
    if (!initialGroupId) return;

    const fetchGroup = async () => {
      try {
        setIsLoadingGroup(true);
        const response = await fetch(`/api/groups/${initialGroupId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load group');
          return;
        }

        const group = await response.json();

        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        groupForm.reset({
          name: group.name || '',
          displayName: group.displayName || '',
          bio: group.bio || '',
          shortBio: group.shortBio || '',
          formedOn: formatDate(group.formedOn),
          endedOn: formatDate(group.endedOn),
          publishedOn: formatDate(group.publishedOn),
          createdBy: group.createdBy || user?.id,
        });

        if (group.publishedOn) {
          setIsPublished(true);
        }

        if (group.images && group.images.length > 0) {
          const existingImages: ImageItem[] = group.images.map(
            (img: {
              id: string;
              src: string;
              caption?: string;
              altText?: string;
              sortOrder?: number;
            }) => ({
              id: img.id,
              preview: img.src,
              uploadedUrl: img.src,
              caption: img.caption || '',
              altText: img.altText || '',
              sortOrder: img.sortOrder ?? 0,
            })
          );
          setImages(existingImages);
        }

        // Load group members
        if (group.artistGroups && group.artistGroups.length > 0) {
          const existingMembers: GroupMember[] = group.artistGroups.map(
            (ag: {
              id: string;
              artistId: string;
              artist: {
                id: string;
                firstName: string;
                surname: string;
                displayName: string | null;
                images?: Array<{ id: string; src: string; sortOrder?: number }>;
              };
            }) => ({
              id: ag.id,
              artistId: ag.artistId,
              artist: ag.artist,
            })
          );
          setMembers(existingMembers);
        }
      } catch (err) {
        error('Failed to fetch group:', err);
        toast.error('Failed to load group data');
      } finally {
        setIsLoadingGroup(false);
      }
    };

    fetchGroup();
  }, [initialGroupId, groupForm, user?.id]);

  const handleImagesChange = useCallback((newImages: ImageItem[]) => {
    setImages(newImages);
  }, []);

  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      setImagesReordered(true);

      if (!groupId) {
        return;
      }

      const result = await reorderGroupImagesAction(groupId, imageIds);

      if (!result.success) {
        toast.error(result.error || 'Failed to save image order');
      }
    },
    [groupId]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await deleteGroupImageAction(imageId);

      if (!result.success) {
        toast.error(result.error || 'Failed to delete image');
      }

      return result;
    },
    []
  );

  // Search for artists
  const handleArtistSearch = useCallback(
    async (query: string) => {
      setArtistSearchQuery(query);

      if (query.length < 2) {
        setArtistSearchResults([]);
        return;
      }

      setIsSearchingArtists(true);
      try {
        const response = await fetch(`/api/artists?search=${encodeURIComponent(query)}&take=10`);
        if (response.ok) {
          const data = await response.json();
          // Filter out artists that are already members
          const memberArtistIds = new Set(members.map((m) => m.artistId));
          const filtered = data.artists.filter(
            (artist: ArtistOption) => !memberArtistIds.has(artist.id)
          );
          setArtistSearchResults(filtered);
        }
      } catch (err) {
        error('Failed to search artists:', err);
      } finally {
        setIsSearchingArtists(false);
      }
    },
    [members]
  );

  // Add a member to the group
  const handleAddMember = useCallback(
    async (artist: ArtistOption) => {
      if (!groupId) {
        // For new groups, store the member locally - will be saved after group creation
        setMembers((prev) => [
          ...prev,
          {
            id: `pending-${artist.id}`,
            artistId: artist.id,
            artist: {
              id: artist.id,
              firstName: artist.firstName,
              surname: artist.surname,
              displayName: artist.displayName,
              images: artist.images,
            },
          },
        ]);
        setMembersChanged(true);
        toast.success(`Added ${getArtistDisplayName(artist)} to group`);
        setArtistSearchOpen(false);
        setArtistSearchQuery('');
        setArtistSearchResults([]);
        return;
      }

      const result = await addGroupMemberAction(groupId, artist.id);

      if (result.success) {
        setMembers((prev) => [
          ...prev,
          {
            id: result.data?.id || artist.id,
            artistId: artist.id,
            artist: {
              id: artist.id,
              firstName: artist.firstName,
              surname: artist.surname,
              displayName: artist.displayName,
              images: artist.images,
            },
          },
        ]);
        setMembersChanged(true);
        toast.success(`Added ${getArtistDisplayName(artist)} to group`);
      } else {
        toast.error(result.error || 'Failed to add member');
      }

      setArtistSearchOpen(false);
      setArtistSearchQuery('');
      setArtistSearchResults([]);
    },
    [groupId]
  );

  // Remove a member from the group
  const handleRemoveMember = useCallback(
    async (member: GroupMember) => {
      if (!groupId) {
        // For new groups, just remove from local state
        setMembers((prev) => prev.filter((m) => m.artistId !== member.artistId));
        setMembersChanged(true);
        toast.success(`Removed ${getArtistDisplayName(member.artist)} from group`);
        return;
      }

      const result = await removeGroupMemberAction(groupId, member.artistId);

      if (result.success) {
        setMembers((prev) => prev.filter((m) => m.artistId !== member.artistId));
        setMembersChanged(true);
        toast.success(`Removed ${getArtistDisplayName(member.artist)} from group`);
      } else {
        toast.error(result.error || 'Failed to remove member');
      }
    },
    [groupId]
  );

  const onSubmitGroupForm = useCallback(
    async (data: GroupFormData) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });
      startTransition(async () => {
        if (formRef.current) {
          const name = data.displayName || data.name;

          if (groupId) {
            const newFormState = await updateGroupAction(groupId, formState, formData);
            if (newFormState.success) {
              if (data.publishedOn && !isPublished) {
                setIsPublished(true);
                toast.success(<PublishedToastContent name={name} />);
              } else {
                toast.success(<UpdatedToastContent name={name} />);
              }
              groupForm.reset(data);
              setImagesReordered(false);
            } else {
              toast.error('Failed to update group. Please check the form for errors.');
            }
          } else {
            const newFormState = await createGroupAction(formState, formData);
            if (newFormState.success) {
              const createdGroupId = newFormState.data?.groupId as string | undefined;

              if (createdGroupId) {
                setGroupId(createdGroupId);
                router.replace(`/admin/groups/${createdGroupId}`, { scroll: false });

                if (data.publishedOn) {
                  setIsPublished(true);
                }

                const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
                if (imagesToUpload.length > 0) {
                  setIsUploadingImages(true);
                  setImages((prev) =>
                    prev.map((img) =>
                      img.file && !img.uploadedUrl ? { ...img, isUploading: true } : img
                    )
                  );

                  try {
                    const imageFormData = new FormData();
                    for (const img of imagesToUpload) {
                      if (img.file) {
                        imageFormData.append('files', img.file);
                        imageFormData.append('captions', img.caption || '');
                        imageFormData.append('altTexts', img.altText || '');
                      }
                    }

                    const uploadResult = await uploadGroupImagesAction(
                      createdGroupId,
                      imageFormData
                    );

                    if (uploadResult.success && uploadResult.data) {
                      setImages((prev) => {
                        const uploadedData = uploadResult.data || [];
                        return prev.map((img, index) => {
                          if (img.file && !img.uploadedUrl && uploadedData[index]) {
                            return {
                              ...img,
                              id: uploadedData[index].id,
                              uploadedUrl: uploadedData[index].src,
                              isUploading: false,
                              sortOrder: uploadedData[index].sortOrder,
                            };
                          }
                          return { ...img, isUploading: false };
                        });
                      });
                      toast.success(
                        <>
                          Group <b>{name}</b> created with {uploadResult.data.length} image
                          {uploadResult.data.length !== 1 ? 's' : ''}.
                        </>
                      );
                    } else {
                      setImages((prev) =>
                        prev.map((img) =>
                          img.file && !img.uploadedUrl
                            ? { ...img, isUploading: false, error: uploadResult.error }
                            : img
                        )
                      );
                      toast.error(uploadResult.error || 'Failed to upload images');
                      toast.success(<ToastContent name={name} />);
                    }
                  } catch (uploadError) {
                    error('Image upload error:', uploadError);
                    setImages((prev) =>
                      prev.map((img) =>
                        img.file && !img.uploadedUrl
                          ? { ...img, isUploading: false, error: 'Upload failed' }
                          : img
                      )
                    );
                    toast.error('Failed to upload images');
                    toast.success(<ToastContent name={name} />);
                  } finally {
                    setIsUploadingImages(false);
                  }
                } else {
                  toast.success(<ToastContent name={name} />);
                }

                // Save pending members after group creation
                if (members.length > 0) {
                  const pendingMembers = members.filter((m) => m.id.startsWith('pending-'));
                  for (const member of pendingMembers) {
                    try {
                      const result = await addGroupMemberAction(createdGroupId, member.artistId);
                      if (result.success && result.data) {
                        // Update the member with the real ID
                        setMembers((prev) =>
                          prev.map((m) =>
                            m.artistId === member.artistId ? { ...m, id: result.data!.id } : m
                          )
                        );
                      }
                    } catch (err) {
                      error('Failed to add member:', err);
                    }
                  }
                }

                groupForm.reset(data);
                setImagesReordered(false);
                setMembersChanged(false);
              } else {
                toast.success(<ToastContent name={name} />);
              }
            } else {
              toast.error('Failed to create group. Please check the form for errors.');
            }
          }
        } else {
          error('GroupForm: Form reference is null on submit.');
          toast.error('Please refresh the page and try again, or check back later.');
        }
      });
    },
    [formState, images, members, groupId, isPublished, groupForm, router]
  );

  const isSubmitting = isPending || isTransitionPending || isUploadingImages;

  // Watch the name field (for potential future use with auto-slug generation)
  const _name = useWatch({ control, name: 'name' });

  const handleSelectDate = (dateString: string, fieldName: string): void => {
    groupForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
  };

  const formatValidationErrors = useCallback((errors: Record<string, { message?: string }>) => {
    const errorMessages = Object.entries(errors)
      .map(([field, error]) => `${field}: ${error.message || 'Invalid'}`)
      .join(', ');
    return errorMessages || 'Please check the form for errors.';
  }, []);

  const handleClickPublishButton = useCallback(() => {
    groupForm.setValue('publishedOn', new Date().toISOString(), { shouldDirty: true });
    groupForm.handleSubmit(onSubmitGroupForm, (errors) => {
      console.error('Form validation errors:', errors);
      toast.error(formatValidationErrors(errors));
    })();
  }, [groupForm, onSubmitGroupForm, formatValidationErrors]);

  const isDirty = groupForm.formState.isDirty || imagesReordered || membersChanged;

  if (!groupForm || !control || isLoadingGroup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialGroupId ? 'Edit Group' : 'Create New Group'}</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <BreadcrumbMenu
        items={[
          {
            anchorText: 'Admin',
            url: '/admin',
            isActive: false,
          },
          {
            anchorText: isEditMode ? 'Edit Group' : 'Create Group',
            url: '/admin/groups',
            isActive: true,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Group' : 'Create New Group'}</CardTitle>
          <CardDescription>
            {isEditMode
              ? 'Update group information. Changes are saved when you click Save.'
              : 'Required fields are marked with an asterisk *'}
          </CardDescription>
        </CardHeader>
        <Form {...groupForm}>
          <form
            action={formAction}
            ref={formRef}
            onSubmit={groupForm.handleSubmit(onSubmitGroupForm, (errors) => {
              console.error('Form validation errors:', errors);
              toast.error(formatValidationErrors(errors));
            })}
            noValidate
          >
            <CardContent className="space-y-6">
              <Separator />
              {/* Name Section */}
              <section className="space-y-4 pt-0">
                <h2 className="font-semibold">Group Information</h2>
                <TextField control={control} name="name" label="Name *" placeholder="Group name" />
                <TextField
                  control={control}
                  name="displayName"
                  label="Display Name"
                  placeholder="Public display name (optional)"
                />
              </section>

              <Separator />

              {/* Images Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Images</h2>
                <p className="text-sm text-muted-foreground">
                  Add images for this group. You can drag to reorder them. Images will be uploaded
                  after the group is created.
                </p>
                <ImageUploader
                  images={images}
                  onImagesChange={handleImagesChange}
                  onReorder={handleReorder}
                  onDelete={handleDeleteImage}
                  maxImages={10}
                  disabled={isSubmitting}
                  label="Upload group images"
                />
              </section>

              <Separator />

              {/* Members Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Members</h2>
                <p className="text-sm text-muted-foreground">
                  Search and add artists who are members of this group.
                </p>

                {/* Artist Search */}
                <Popover open={artistSearchOpen} onOpenChange={setArtistSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={artistSearchOpen}
                      className="w-full justify-between"
                      disabled={isSubmitting}
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Add member...
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-(--radix-popover-trigger-width) min-w-[300px] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search artists by name..."
                        value={artistSearchQuery}
                        onValueChange={handleArtistSearch}
                      />
                      <CommandList>
                        {isSearchingArtists ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            Searching...
                          </div>
                        ) : artistSearchResults.length === 0 ? (
                          <CommandEmpty>
                            {artistSearchQuery.length < 2 ? (
                              <span className="p-4 text-sm text-muted-foreground">
                                Type at least 2 characters to search
                              </span>
                            ) : (
                              'No artists found'
                            )}
                          </CommandEmpty>
                        ) : (
                          <CommandGroup heading="Artists">
                            {artistSearchResults.map((artist) => (
                              <CommandItem
                                key={artist.id}
                                value={artist.id}
                                onSelect={() => handleAddMember(artist)}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    members.some((m) => m.artistId === artist.id)
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                <Avatar className="mr-2 h-6 w-6 shrink-0">
                                  <AvatarImage
                                    src={getArtistThumbnail(artist)}
                                    alt={getArtistDisplayName(artist)}
                                  />
                                  <AvatarFallback className="text-xs">
                                    {getArtistInitials(artist)}
                                  </AvatarFallback>
                                </Avatar>
                                {getArtistDisplayName(artist)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Member List */}
                {members.length > 0 ? (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage
                              src={getArtistThumbnail(member.artist)}
                              alt={getArtistDisplayName(member.artist)}
                            />
                            <AvatarFallback className="text-xs">
                              {getArtistInitials(member.artist)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{getArtistDisplayName(member.artist)}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Remove member</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No members added yet
                  </div>
                )}
              </section>

              <Separator />

              {/* Biography Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Biography</h2>
                <FormField
                  control={control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Group biography" className="min-h-32" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="shortBio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief group description"
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              {/* Dates Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Important Dates</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="formedOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Formed on</FormLabel>
                        <FormControl>
                          <DatePicker
                            fieldName={field.name}
                            onSelect={handleSelectDate}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="endedOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ended on</FormLabel>
                        <FormControl>
                          <DatePicker
                            fieldName={field.name}
                            onSelect={handleSelectDate}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </CardContent>

            <CardFooter className="flex justify-end gap-4">
              {isEditMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isPublished}
                    onClick={handleClickPublishButton}
                  >
                    {isPublished ? 'Published' : 'Publish'}
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" disabled={isSubmitting} onClick={handleClickPublishButton}>
                    Create &amp; Publish
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                </>
              )}
            </CardFooter>
          </form>
        </Form>
      </Card>
    </>
  );
}
