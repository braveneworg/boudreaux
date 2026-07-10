/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Card, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import {
  useCreateVideoMutation,
  useUpdateVideoMutation,
} from '@/app/hooks/mutations/use-video-mutations';
import { useVideoQuery } from '@/app/hooks/use-video-query';
import { generateObjectId } from '@/lib/utils/generate-object-id';
import { createVideoSchema, type VideoFormData } from '@/lib/validation/create-video-schema';
import { ZinePanel } from '@/ui/zine-panel';

import { useVideoUpload } from './videos/use-video-upload';
import { VideoFileSection } from './videos/video-file-section';
import { VideoFormFooter } from './videos/video-form-footer';
import {
  applyServerFieldErrors,
  buildVideoDefaults,
  mapVideoToFormValues,
} from './videos/video-form-helpers';
import { VideoMetadataSection } from './videos/video-metadata-section';
import { VideoPosterSection } from './videos/video-poster-section';
import { VideoPublishSection } from './videos/video-publish-section';

import type { UseFormReturn } from 'react-hook-form';

export interface VideoFormProps {
  videoId?: string;
}

interface SubmitVideoDeps {
  isEditMode: boolean;
  videoId: string | undefined;
  preGeneratedId: string;
  form: UseFormReturn<VideoFormData>;
  router: ReturnType<typeof useRouter>;
  createVideoAsync: ReturnType<typeof useCreateVideoMutation>['createVideoAsync'];
  updateVideoAsync: ReturnType<typeof useUpdateVideoMutation>['updateVideoAsync'];
}

/** Dispatch to the create/update mutation, then map errors or navigate on success. */
const submitVideo = async (data: VideoFormData, deps: SubmitVideoDeps): Promise<void> => {
  const { isEditMode, videoId, preGeneratedId, form, router } = deps;
  const result =
    isEditMode && videoId
      ? await deps.updateVideoAsync({ id: videoId, values: data })
      : await deps.createVideoAsync({ ...data, preGeneratedId });

  if (!result.success) {
    applyServerFieldErrors(form.setError, result.errors);
    toast.error(
      result.errors?.general?.[0] ?? `Failed to ${isEditMode ? 'update' : 'create'} the video.`
    );
    return;
  }

  toast.success(`Video ${isEditMode ? 'updated' : 'created'} successfully.`);
  router.push('/admin/videos');
};

export const VideoForm = ({ videoId }: VideoFormProps): React.ReactElement => {
  const router = useRouter();
  const isEditMode = videoId !== undefined;
  const [preGeneratedId] = useState<string>(() => videoId ?? generateObjectId());
  const [posterCandidate, setPosterCandidate] = useState<Blob | null>(null);

  const { createVideoAsync, isCreatingVideo } = useCreateVideoMutation();
  const { updateVideoAsync, isUpdatingVideo } = useUpdateVideoMutation();
  const { data: video, isPending } = useVideoQuery(videoId ?? '', { enabled: isEditMode });

  const form = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: buildVideoDefaults(),
  });
  const { control, setValue } = form;

  useEffect(() => {
    if (isEditMode && video) {
      form.reset(mapVideoToFormValues(video));
    }
  }, [isEditMode, video, form]);

  const upload = useVideoUpload({ preGeneratedId, form, onPosterCandidate: setPosterCandidate });
  const s3Key = useWatch({ control, name: 's3Key' });
  const isSubmitting = isCreatingVideo || isUpdatingVideo;

  const handleSelectDate = useCallback(
    (dateString: string, fieldName: string): void => {
      setValue(fieldName as keyof VideoFormData, dateString, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  const onValidSubmit = useCallback(
    (data: VideoFormData): Promise<void> =>
      submitVideo(data, {
        isEditMode,
        videoId,
        preGeneratedId,
        form,
        router,
        createVideoAsync,
        updateVideoAsync,
      }),
    [isEditMode, videoId, preGeneratedId, form, router, createVideoAsync, updateVideoAsync]
  );

  const handleCancel = useCallback(() => router.push('/admin/videos'), [router]);

  if (isEditMode && isPending) {
    return <div className="flex items-center justify-center p-8 text-zinc-700">Loading video…</div>;
  }

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        {
          anchorText: isEditMode ? 'Edit Video' : 'New Video',
          url: '/admin/videos',
          isActive: true,
        },
      ]}
    >
      <Card className="w-full border-none px-0 pb-0">
        <CardHeader className="px-0">
          <CardTitle>{isEditMode ? 'Edit Video' : 'New Video'}</CardTitle>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onValidSubmit)} noValidate className="space-y-8">
            <VideoFileSection control={control} upload={upload} />
            <VideoMetadataSection control={control} onSelectDate={handleSelectDate} />
            <VideoPosterSection
              control={control}
              setValue={setValue}
              preGeneratedId={preGeneratedId}
              candidate={posterCandidate}
            />
            <VideoPublishSection control={control} onSelectDate={handleSelectDate} />

            {!s3Key ? (
              <p role="status" className="text-sm text-zinc-700">
                Upload a video file to enable saving.
              </p>
            ) : null}

            <VideoFormFooter
              isSubmitting={isSubmitting}
              isUploading={upload.status === 'uploading'}
              onCancel={handleCancel}
            />
          </form>
        </Form>
      </Card>
    </ZinePanel>
  );
};
