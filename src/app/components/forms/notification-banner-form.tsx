'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, Crop, ImagePlus, Loader2, Undo2, Upload, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import {
  ImageCropper,
  BANNER_WIDTH,
  BANNER_HEIGHT,
  type CropResult,
} from '@/app/components/ui/image-cropper';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Separator } from '@/app/components/ui/separator';
import { Slider } from '@/app/components/ui/slider';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import {
  createNotificationBannerAction,
  updateNotificationBannerAction,
} from '@/lib/actions/notification-banner-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { processNotificationImageAction } from '@/lib/actions/process-notification-image-action';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';
import { error } from '@/lib/utils/console-logger';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';
import {
  notificationBannerSchema,
  SYSTEM_FONTS,
  type NotificationBannerFormData,
} from '@/lib/validation/notification-banner-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof NotificationBannerFormData;

interface NotificationBannerFormProps {
  notificationId?: string;
}

/**
 * Convert a hex color to rgba with specified opacity
 * @param hex - Hex color string (e.g., '#ffffff' or '#fff')
 * @param opacity - Opacity value from 0 to 1
 * @returns rgba string
 */
const hexToRgba = (hex: string, opacity: number): string => {
  // Remove # if present and handle 3-digit hex
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

  // Return fallback for invalid hex
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(255, 255, 255, ${opacity})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ message }: { message: string }) => (
  <>
    Notification banner <b>{message.substring(0, 30) || 'entry'}</b> saved successfully.
  </>
);

export default function NotificationBannerForm({
  notificationId: initialNotificationId,
}: NotificationBannerFormProps) {
  const isEditMode = !!initialNotificationId;
  const action = isEditMode ? updateNotificationBannerAction : createNotificationBannerAction;

  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    action,
    initialFormState
  );
  const [isLoadingNotification, setIsLoadingNotification] = useState(!!initialNotificationId);
  const [notificationId, setNotificationId] = useState<string | null>(
    initialNotificationId || null
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [_selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string>('');
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string>('');
  const [originalImageBase64, setOriginalImageBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropper state
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string>('');
  const [originalFileName, setOriginalFileName] = useState<string>('');

  const router = useRouter();
  const { data: _session } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const secondaryMessageTextareaRef = useRef<HTMLTextAreaElement>(null);

  const form = useForm<NotificationBannerFormData>({
    resolver: zodResolver(notificationBannerSchema),
    defaultValues: {
      message: '',
      secondaryMessage: '',
      notes: '',
      originalImageUrl: '',
      imageUrl: '',
      linkUrl: '',
      backgroundColor: '',
      isOverlayed: true,
      isActive: true,
      displayFrom: '',
      displayUntil: '',
      // Font styling defaults
      messageFont: 'system-ui',
      messageFontSize: 2.5,
      messageContrast: 100,
      secondaryMessageFont: 'system-ui',
      secondaryMessageFontSize: 2,
      secondaryMessageContrast: 95,
      // Text color defaults
      messageTextColor: '#ffffff',
      secondaryMessageTextColor: '#ffffff',
      // Text shadow defaults
      messageTextShadow: true,
      messageTextShadowDarkness: 50,
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 50,
      // Position defaults (percentage 0-100)
      messagePositionX: 50,
      messagePositionY: 10,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 90,
    },
  });
  const { control, setValue, watch } = form;

  // Watch fields for preview
  const watchedImageUrl = watch('imageUrl');
  const watchedBackgroundColor = watch('backgroundColor');
  const watchedMessage = watch('message');
  const watchedSecondaryMessage = watch('secondaryMessage');
  const watchedIsOverlayed = watch('isOverlayed');
  // Font styling watched values for live preview
  const watchedMessageFont = watch('messageFont');
  const watchedMessageFontSize = watch('messageFontSize');
  const watchedMessageContrast = watch('messageContrast');
  const watchedSecondaryMessageFont = watch('secondaryMessageFont');
  const watchedSecondaryMessageFontSize = watch('secondaryMessageFontSize');
  const watchedSecondaryMessageContrast = watch('secondaryMessageContrast');
  // Text color watched values for live preview
  const watchedMessageTextColor = watch('messageTextColor');
  const watchedSecondaryMessageTextColor = watch('secondaryMessageTextColor');
  // Text shadow watched values for live preview
  const watchedMessageTextShadow = watch('messageTextShadow');
  const watchedMessageTextShadowDarkness = watch('messageTextShadowDarkness');
  const watchedSecondaryMessageTextShadow = watch('secondaryMessageTextShadow');
  const watchedSecondaryMessageTextShadowDarkness = watch('secondaryMessageTextShadowDarkness');
  // Position watched values for live preview
  const watchedMessagePositionX = watch('messagePositionX');
  const watchedMessagePositionY = watch('messagePositionY');
  const watchedSecondaryMessagePositionX = watch('secondaryMessagePositionX');
  const watchedSecondaryMessagePositionY = watch('secondaryMessagePositionY');

  // Drag state for positioning text
  const [isDraggingMessage, setIsDraggingMessage] = useState(false);
  const [isDraggingSecondary, setIsDraggingSecondary] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Fetch notification data when initialNotificationId is provided
  useEffect(() => {
    if (!initialNotificationId) return;

    const fetchNotification = async () => {
      try {
        setIsLoadingNotification(true);
        const response = await fetch(`/api/notifications/${initialNotificationId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load notification');
          return;
        }

        const notification = await response.json();

        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        form.reset({
          message: notification.message || '',
          secondaryMessage: notification.secondaryMessage || '',
          notes: notification.notes || '',
          originalImageUrl: notification.originalImageUrl || '',
          imageUrl: notification.imageUrl || '',
          linkUrl: notification.linkUrl || '',
          backgroundColor: notification.backgroundColor || '',
          isOverlayed: notification.isOverlayed ?? true,
          isActive: notification.isActive ?? true,
          displayFrom: formatDate(notification.displayFrom),
          displayUntil: formatDate(notification.displayUntil),
          // Font styling fields
          messageFont: notification.messageFont || 'system-ui',
          messageFontSize: notification.messageFontSize ?? 2.5,
          messageContrast: notification.messageContrast ?? 100,
          secondaryMessageFont: notification.secondaryMessageFont || 'system-ui',
          secondaryMessageFontSize: notification.secondaryMessageFontSize ?? 2,
          secondaryMessageContrast: notification.secondaryMessageContrast ?? 95,
          // Text color fields
          messageTextColor: notification.messageTextColor || '#ffffff',
          secondaryMessageTextColor: notification.secondaryMessageTextColor || '#ffffff',
          // Text shadow fields
          messageTextShadow: notification.messageTextShadow ?? true,
          messageTextShadowDarkness: notification.messageTextShadowDarkness ?? 50,
          secondaryMessageTextShadow: notification.secondaryMessageTextShadow ?? true,
          secondaryMessageTextShadowDarkness: notification.secondaryMessageTextShadowDarkness ?? 50,
          // Position fields
          messagePositionX: notification.messagePositionX ?? 50,
          messagePositionY: notification.messagePositionY ?? 10,
          secondaryMessagePositionX: notification.secondaryMessagePositionX ?? 50,
          secondaryMessagePositionY: notification.secondaryMessagePositionY ?? 90,
        });

        // Set preview URLs from existing notification
        if (notification.originalImageUrl) {
          setOriginalPreviewUrl(notification.originalImageUrl);
        }
        if (notification.imageUrl) {
          setProcessedPreviewUrl(notification.imageUrl);
        }
      } catch (err) {
        error('Failed to fetch notification:', err);
        toast.error('Failed to load notification data');
      } finally {
        setIsLoadingNotification(false);
      }
    };

    fetchNotification();
  }, [initialNotificationId, form]);

  // Handle form submission success/failure
  useEffect(() => {
    if (formState.success && formState.data?.notificationId) {
      const message = form.getValues('message');
      toast.success(<ToastContent message={message || ''} />);
      const newId =
        typeof formState.data.notificationId === 'string' ? formState.data.notificationId : null;
      setNotificationId(newId);
      router.push('/admin/notifications');
    }

    if (formState.errors?.general) {
      toast.error(formState.errors.general[0]);
    }
  }, [formState, form, router]);

  // Sync form errors with server-side validation
  useEffect(() => {
    if (formState.errors) {
      Object.entries(formState.errors).forEach(([field, messages]) => {
        if (field !== 'general' && messages && messages.length > 0) {
          form.setError(field as FormFieldName, {
            type: 'server',
            message: messages[0],
          });
        }
      });
    }
  }, [formState.errors, form]);

  const handleDateSelect = (dateString: string, fieldName: string) => {
    const dateOnly = dateString.split('T')[0];
    if (fieldName === 'displayFrom') {
      setValue('displayFrom', dateOnly);
    } else if (fieldName === 'displayUntil') {
      setValue('displayUntil', dateOnly);
    }
  };

  // Process a file for upload (shared between file input and drag-drop)
  const processFile = useCallback((file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    // Validate file size (max 50MB before resize)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Image must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    setOriginalFileName(file.name);

    // Create local preview and open cropper
    const localPreview = URL.createObjectURL(file);
    setImageToCrop(localPreview);
    setCropperOpen(true);
  }, []);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  // Handle file selection for image upload
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  /**
   * Converts a Blob to a base64 string
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 string
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Processes the original image with text overlay on the backend
   */
  const processImageWithOverlay = useCallback(
    async (imageBase64: string) => {
      const message = form.getValues('message');
      const secondaryMessage = form.getValues('secondaryMessage');
      const isOverlayed = form.getValues('isOverlayed');
      const messageFont = form.getValues('messageFont');
      const messageFontSize = form.getValues('messageFontSize');
      const messageContrast = form.getValues('messageContrast');
      const secondaryMessageFont = form.getValues('secondaryMessageFont');
      const secondaryMessageFontSize = form.getValues('secondaryMessageFontSize');
      const secondaryMessageContrast = form.getValues('secondaryMessageContrast');
      const messageTextColor = form.getValues('messageTextColor');
      const secondaryMessageTextColor = form.getValues('secondaryMessageTextColor');
      const messageTextShadow = form.getValues('messageTextShadow');
      const messageTextShadowDarkness = form.getValues('messageTextShadowDarkness');
      const secondaryMessageTextShadow = form.getValues('secondaryMessageTextShadow');
      const secondaryMessageTextShadowDarkness = form.getValues(
        'secondaryMessageTextShadowDarkness'
      );
      const messagePositionX = form.getValues('messagePositionX');
      const messagePositionY = form.getValues('messagePositionY');
      const secondaryMessagePositionX = form.getValues('secondaryMessagePositionX');
      const secondaryMessagePositionY = form.getValues('secondaryMessagePositionY');

      if (!isOverlayed || !message) {
        // No processing needed, use original image directly
        return null;
      }

      setIsProcessingImage(true);
      setUploadProgress('Processing image with text overlay...');

      try {
        const result = await processNotificationImageAction({
          imageBase64,
          mimeType: 'image/jpeg',
          message,
          secondaryMessage: secondaryMessage || undefined,
          isOverlayed,
          width: BANNER_WIDTH,
          height: BANNER_HEIGHT,
          messageFont,
          messageFontSize,
          messageContrast,
          secondaryMessageFont,
          secondaryMessageFontSize,
          secondaryMessageContrast,
          messageTextColor,
          secondaryMessageTextColor,
          messageTextShadow,
          messageTextShadowDarkness,
          secondaryMessageTextShadow,
          secondaryMessageTextShadowDarkness,
          messagePositionX,
          messagePositionY,
          secondaryMessagePositionX,
          secondaryMessagePositionY,
        });

        if (!result.success || !result.processedImageBase64) {
          throw new Error(result.error || 'Failed to process image');
        }

        // Convert base64 back to blob for upload (without using fetch to avoid CSP issues)
        const byteCharacters = atob(result.processedImageBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const processedBlob = new Blob([byteArray], { type: result.mimeType || 'image/jpeg' });

        // Create local preview of processed image
        const processedPreview = URL.createObjectURL(processedBlob);
        setProcessedPreviewUrl(processedPreview);

        return { blob: processedBlob, base64: result.processedImageBase64 };
      } catch (err) {
        error('Image processing failed:', err);
        throw err;
      } finally {
        setIsProcessingImage(false);
      }
    },
    [form]
  );

  /**
   * Handles the crop completion from the ImageCropper
   * Uploads original image and processes with text overlay on backend
   */
  const handleCropComplete = useCallback(
    async (result: CropResult) => {
      setCropperOpen(false);

      // If the cropper provided a background color, update the form
      if (result.backgroundColor) {
        setValue('backgroundColor', result.backgroundColor);
      }

      // Clear any existing image URLs while uploading
      setValue('originalImageUrl', '');
      setValue('imageUrl', '');

      try {
        setIsUploadingImage(true);
        setUploadProgress('Processing image...');

        // Convert original cropped image to base64
        const base64 = await blobToBase64(result.blob);
        setOriginalImageBase64(base64);

        // Set local preview of original image
        const originalPreview = URL.createObjectURL(result.blob);
        setOriginalPreviewUrl(originalPreview);

        // Create a File from the original cropped blob
        const baseFileName = originalFileName.replace(/\.[^/.]+$/, '');
        const originalFile = new File([result.blob], `${baseFileName}-original.jpg`, {
          type: 'image/jpeg',
        });

        setUploadProgress('Uploading original image...');

        // Generate a temporary ID for new notifications
        const uploadId = notificationId || `temp-${Date.now()}`;

        // Get presigned URL for original image
        const originalPresignedResult = await getPresignedUploadUrlsAction(
          'notifications',
          uploadId,
          [
            {
              fileName: originalFile.name,
              contentType: originalFile.type,
              fileSize: originalFile.size,
            },
          ]
        );

        if (!originalPresignedResult.success || !originalPresignedResult.data?.[0]) {
          throw new Error(originalPresignedResult.error || 'Failed to get upload URL');
        }

        // Upload original to S3
        const originalUploadResult = await uploadFileToS3(
          originalFile,
          originalPresignedResult.data[0]
        );

        if (!originalUploadResult.success) {
          throw new Error(originalUploadResult.error || 'Original upload failed');
        }

        // Set the original CDN URL in the form
        setValue('originalImageUrl', originalUploadResult.cdnUrl);
        setOriginalPreviewUrl(originalUploadResult.cdnUrl);

        // Process with text overlay on backend
        const processedResult = await processImageWithOverlay(base64);

        if (processedResult) {
          // Upload processed image
          const processedFile = new File([processedResult.blob], `${baseFileName}-banner.jpg`, {
            type: 'image/jpeg',
          });

          setUploadProgress('Uploading processed image...');

          const processedPresignedResult = await getPresignedUploadUrlsAction(
            'notifications',
            uploadId,
            [
              {
                fileName: processedFile.name,
                contentType: processedFile.type,
                fileSize: processedFile.size,
              },
            ]
          );

          if (!processedPresignedResult.success || !processedPresignedResult.data?.[0]) {
            throw new Error(processedPresignedResult.error || 'Failed to get upload URL');
          }

          const processedUploadResult = await uploadFileToS3(
            processedFile,
            processedPresignedResult.data[0]
          );

          if (!processedUploadResult.success) {
            throw new Error(processedUploadResult.error || 'Processed upload failed');
          }

          // Set the processed CDN URL in the form
          setValue('imageUrl', processedUploadResult.cdnUrl);
          setProcessedPreviewUrl(processedUploadResult.cdnUrl);
        } else {
          // No overlay needed, use original for both
          setValue('imageUrl', originalUploadResult.cdnUrl);
          setProcessedPreviewUrl(originalUploadResult.cdnUrl);
        }

        setUploadProgress('Upload complete!');
        toast.success(`Image cropped to ${BANNER_WIDTH}×${BANNER_HEIGHT} and uploaded!`);
      } catch (err) {
        error('Image upload failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to upload image');
        setUploadProgress('');

        // Clear the previews on error
        setOriginalPreviewUrl('');
        setProcessedPreviewUrl('');
        setOriginalImageBase64('');
        setSelectedFile(null);
      } finally {
        setIsUploadingImage(false);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [notificationId, originalFileName, setValue, processImageWithOverlay]
  );

  /**
   * Re-processes the image when message or overlay settings change
   */
  const reprocessImage = useCallback(async () => {
    if (!originalImageBase64) return;

    try {
      const processedResult = await processImageWithOverlay(originalImageBase64);

      if (processedResult) {
        // Upload processed image
        const baseFileName = originalFileName.replace(/\.[^/.]+$/, '') || 'banner';
        const processedFile = new File([processedResult.blob], `${baseFileName}-banner.jpg`, {
          type: 'image/jpeg',
        });

        setUploadProgress('Uploading updated image...');
        setIsUploadingImage(true);

        const uploadId = notificationId || `temp-${Date.now()}`;

        const processedPresignedResult = await getPresignedUploadUrlsAction(
          'notifications',
          uploadId,
          [
            {
              fileName: processedFile.name,
              contentType: processedFile.type,
              fileSize: processedFile.size,
            },
          ]
        );

        if (!processedPresignedResult.success || !processedPresignedResult.data?.[0]) {
          throw new Error(processedPresignedResult.error || 'Failed to get upload URL');
        }

        const processedUploadResult = await uploadFileToS3(
          processedFile,
          processedPresignedResult.data[0]
        );

        if (!processedUploadResult.success) {
          throw new Error(processedUploadResult.error || 'Processed upload failed');
        }

        setValue('imageUrl', processedUploadResult.cdnUrl);
        setProcessedPreviewUrl(processedUploadResult.cdnUrl);
        setUploadProgress('');
        toast.success('Image updated with new text overlay!');
      } else {
        // No overlay, use original
        const originalUrl = form.getValues('originalImageUrl');
        setValue('imageUrl', originalUrl);
        setProcessedPreviewUrl(originalUrl || '');
      }
    } catch (err) {
      error('Image reprocessing failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update image');
      setUploadProgress('');
    } finally {
      setIsUploadingImage(false);
    }
  }, [
    originalImageBase64,
    originalFileName,
    notificationId,
    setValue,
    form,
    processImageWithOverlay,
  ]);

  // Clear uploaded image
  const handleClearImage = useCallback(() => {
    setValue('originalImageUrl', '');
    setValue('imageUrl', '');
    setSelectedFile(null);
    if (originalPreviewUrl && !originalPreviewUrl.startsWith('http')) {
      URL.revokeObjectURL(originalPreviewUrl);
    }
    if (processedPreviewUrl && !processedPreviewUrl.startsWith('http')) {
      URL.revokeObjectURL(processedPreviewUrl);
    }
    setOriginalPreviewUrl('');
    setProcessedPreviewUrl('');
    setOriginalImageBase64('');
    setUploadProgress('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setValue, originalPreviewUrl, processedPreviewUrl]);

  // Reset to original image (remove text overlay)
  const handleResetToOriginal = useCallback(() => {
    const originalUrl = form.getValues('originalImageUrl');
    if (originalUrl) {
      setValue('imageUrl', originalUrl);
      setProcessedPreviewUrl(originalUrl);
      toast.success('Reset to original image (without text overlay)');
    }
  }, [setValue, form]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    if (formRef.current) {
      const formData = new FormData(formRef.current);

      // Add notification ID for update
      if (notificationId) {
        formData.append('notificationId', notificationId);
      }

      // Ensure boolean fields are included
      const isOverlayed = form.getValues('isOverlayed');
      const isActive = form.getValues('isActive');
      formData.set('isOverlayed', isOverlayed ? 'true' : 'false');
      formData.set('isActive', isActive ? 'true' : 'false');

      // Ensure numeric font fields are included
      const messageFontSize = form.getValues('messageFontSize');
      const messageContrast = form.getValues('messageContrast');
      const secondaryMessageFontSize = form.getValues('secondaryMessageFontSize');
      const secondaryMessageContrast = form.getValues('secondaryMessageContrast');
      formData.set('messageFontSize', String(messageFontSize));
      formData.set('messageContrast', String(messageContrast));
      formData.set('secondaryMessageFontSize', String(secondaryMessageFontSize));
      formData.set('secondaryMessageContrast', String(secondaryMessageContrast));

      // Ensure text color fields are included
      const messageTextColor = form.getValues('messageTextColor');
      const secondaryMessageTextColor = form.getValues('secondaryMessageTextColor');
      formData.set('messageTextColor', messageTextColor || '#ffffff');
      formData.set('secondaryMessageTextColor', secondaryMessageTextColor || '#ffffff');

      // Ensure text shadow fields are included
      const messageTextShadow = form.getValues('messageTextShadow');
      const messageTextShadowDarkness = form.getValues('messageTextShadowDarkness');
      const secondaryMessageTextShadow = form.getValues('secondaryMessageTextShadow');
      const secondaryMessageTextShadowDarkness = form.getValues(
        'secondaryMessageTextShadowDarkness'
      );
      formData.set('messageTextShadow', messageTextShadow ? 'true' : 'false');
      formData.set('messageTextShadowDarkness', String(messageTextShadowDarkness));
      formData.set('secondaryMessageTextShadow', secondaryMessageTextShadow ? 'true' : 'false');
      formData.set(
        'secondaryMessageTextShadowDarkness',
        String(secondaryMessageTextShadowDarkness)
      );

      // Ensure backgroundColor is included
      const backgroundColor = form.getValues('backgroundColor');
      if (backgroundColor) {
        formData.set('backgroundColor', backgroundColor);
      }

      formAction(formData);
    }
  };

  const handleCancel = () => {
    router.push('/admin/notifications');
  };

  /**
   * Handle drag start for message positioning
   */
  const handleMessageDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingMessage(true);
  }, []);

  /**
   * Handle drag start for secondary message positioning
   */
  const handleSecondaryDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingSecondary(true);
  }, []);

  /**
   * Handle drag move for both messages
   */
  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDraggingMessage && !isDraggingSecondary) return;
      if (!previewContainerRef.current) return;

      const container = previewContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Get position from mouse or touch event
      let clientX: number;
      let clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Calculate percentage position (0-100)
      const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

      if (isDraggingMessage) {
        setValue('messagePositionX', Math.round(x));
        setValue('messagePositionY', Math.round(y));
      } else if (isDraggingSecondary) {
        setValue('secondaryMessagePositionX', Math.round(x));
        setValue('secondaryMessagePositionY', Math.round(y));
      }
    },
    [isDraggingMessage, isDraggingSecondary, setValue]
  );

  /**
   * Handle drag end for both messages
   */
  const handleDragEnd = useCallback(() => {
    setIsDraggingMessage(false);
    setIsDraggingSecondary(false);
  }, []);

  // Add document-level event listeners for drag
  useEffect(() => {
    if (isDraggingMessage || isDraggingSecondary) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [isDraggingMessage, isDraggingSecondary, handleDragMove, handleDragEnd]);

  if (isLoadingNotification) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading notification...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Notifications', url: '/admin/notifications', isActive: false },
          { anchorText: isEditMode ? 'Edit' : 'New', url: '#', isActive: true },
        ]}
      />

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {isEditMode ? 'Edit Notification Banner' : 'Create Notification Banner'}
              </CardTitle>
              <CardDescription>
                {isEditMode
                  ? 'Update the notification banner details below.'
                  : 'Create a new notification banner to display on the home page.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Background Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Background Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Upload an image or provide a background color. Images will be automatically
                  resized to 880 pixels wide.
                </p>

                {/* Image Upload */}
                <FormField
                  control={control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banner Image</FormLabel>
                      <div className="space-y-3">
                        {/* Drop zone */}
                        <div
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                            isDragging
                              ? 'border-primary bg-primary/5'
                              : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50'
                          } ${isUploadingImage ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          <Upload
                            className={`mb-2 h-8 w-8 ${
                              isDragging ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          />
                          <p className="text-sm font-medium">
                            {isDragging ? 'Drop image here' : 'Drag & drop an image here'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                        </div>

                        {/* Hidden file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleFileSelect}
                          disabled={isUploadingImage}
                          className="hidden"
                          id="banner-image-upload"
                        />

                        {/* Upload button and progress */}
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="banner-image-upload"
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                              isUploadingImage ? 'cursor-not-allowed opacity-50' : ''
                            }`}
                          >
                            {isUploadingImage ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <ImagePlus className="h-4 w-4" />
                                Upload Image
                              </>
                            )}
                          </label>
                          {uploadProgress && (
                            <span className="text-sm text-muted-foreground">{uploadProgress}</span>
                          )}
                          {isProcessingImage && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing image...
                            </span>
                          )}
                        </div>

                        {/* Original and Processed image preview */}
                        {(originalPreviewUrl || processedPreviewUrl || field.value) && (
                          <div className="space-y-4">
                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {/* Re-crop button - only show if we have the original image */}
                              {imageToCrop && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCropperOpen(true)}
                                >
                                  <Crop className="mr-2 h-4 w-4" />
                                  Re-crop
                                </Button>
                              )}
                              {/* Reprocess button - only show if we have original and overlay is enabled */}
                              {originalImageBase64 && watchedIsOverlayed && watchedMessage && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={reprocessImage}
                                  disabled={isProcessingImage || isUploadingImage}
                                >
                                  {isProcessingImage ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <ImagePlus className="mr-2 h-4 w-4" />
                                      Update Text
                                    </>
                                  )}
                                </Button>
                              )}
                              {/* Reset to original button - show when processed differs from original */}
                              {originalPreviewUrl &&
                                processedPreviewUrl &&
                                originalPreviewUrl !== processedPreviewUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleResetToOriginal}
                                    disabled={isProcessingImage || isUploadingImage}
                                  >
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    Reset to Original
                                  </Button>
                                )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleClearImage}
                              >
                                <X className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>

                            {/* Dual preview when we have both */}
                            {originalPreviewUrl &&
                              processedPreviewUrl &&
                              originalPreviewUrl !== processedPreviewUrl && (
                                <div
                                  className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen space-y-4"
                                  style={{ marginTop: '1rem' }}
                                >
                                  {/* Original image - full viewport width */}
                                  <div className="space-y-1">
                                    <p className="px-4 text-sm font-medium text-muted-foreground sm:px-6 md:px-8">
                                      Original
                                    </p>
                                    <div
                                      className="relative w-full overflow-hidden"
                                      style={{ paddingBottom: `${100 / 1.618}%` }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={originalPreviewUrl}
                                        alt="Original banner"
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                    </div>
                                  </div>
                                  {/* Processed image - full viewport width */}
                                  <div className="space-y-1">
                                    <p className="px-4 text-sm font-medium text-muted-foreground sm:px-6 md:px-8">
                                      With Text Overlay
                                    </p>
                                    <div
                                      className="relative w-full overflow-hidden"
                                      style={{ paddingBottom: `${100 / 1.618}%` }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={processedPreviewUrl}
                                        alt="Processed banner"
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                            {/* Single preview (when original equals processed or only one exists) */}
                            {(!originalPreviewUrl ||
                              !processedPreviewUrl ||
                              originalPreviewUrl === processedPreviewUrl) && (
                              <div
                                className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen"
                                style={{ marginTop: '1rem' }}
                              >
                                <div
                                  className="relative w-full overflow-hidden"
                                  style={{ paddingBottom: `${100 / 1.618}%` }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={processedPreviewUrl || originalPreviewUrl || field.value}
                                    alt="Banner preview"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                </div>
                                <p className="mt-1 px-4 text-xs text-muted-foreground sm:px-6 md:px-8">
                                  {(originalPreviewUrl || processedPreviewUrl)?.startsWith('blob:')
                                    ? 'Preview (uploading...)'
                                    : 'Uploaded image'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Hidden fields for form submission */}
                        <FormControl>
                          <Input type="hidden" {...field} />
                        </FormControl>
                      </div>
                      <FormDescription>
                        Upload a banner image. You&apos;ll be able to crop it to show the portion of
                        the image you want. Optionally add a background color for images that
                        don&apos;t fill the frame.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Hidden field for originalImageUrl */}
                <FormField
                  control={control}
                  name="originalImageUrl"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Hidden fields for text position */}
                <FormField
                  control={control}
                  name="messagePositionX"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 50} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="messagePositionY"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 10} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="secondaryMessagePositionX"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 50} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="secondaryMessagePositionY"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 90} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Background Color</FormLabel>
                        {field.value && (
                          <span className="text-sm text-muted-foreground">{field.value}</span>
                        )}
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={field.value || '#000000'}
                            onChange={(e) => setValue('backgroundColor', e.target.value)}
                            className="h-10 w-14 cursor-pointer p-1"
                          />
                          <Input
                            type="text"
                            name="backgroundColor"
                            value={field.value || ''}
                            onChange={(e) => setValue('backgroundColor', e.target.value)}
                            placeholder="#000000"
                            className="flex-1 font-mono"
                            maxLength={7}
                          />
                          {field.value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setValue('backgroundColor', '')}
                              className="px-2"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Hex color code (e.g., #ffffff). Used when no image is provided.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Message (Required) */}
                <FormField
                  control={control}
                  name="message"
                  render={({ field: { ref, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Message *</FormLabel>
                      <FormControl>
                        <Textarea
                          ref={(el) => {
                            ref(el);
                            messageTextareaRef.current = el;
                          }}
                          placeholder="Enter the main notification message"
                          rows={4}
                          {...fieldProps}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Secondary Message */}
                <FormField
                  control={control}
                  name="secondaryMessage"
                  render={({ field: { ref, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Secondary Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          ref={(el) => {
                            ref(el);
                            secondaryMessageTextareaRef.current = el;
                          }}
                          placeholder="Additional context or subtitle"
                          rows={4}
                          {...fieldProps}
                        />
                      </FormControl>
                      <FormDescription>
                        Displayed below the main message in a smaller font.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="isOverlayed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Overlay text on image</FormLabel>
                        <FormDescription>
                          When enabled, text will be displayed on top of the background image.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          name={field.name}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Font Styling Settings - only show when overlay is enabled */}
                {watchedIsOverlayed && (
                  <div className="space-y-6 rounded-lg border p-4">
                    <h4 className="font-medium">Text Styling</h4>

                    {/* Message Font Settings */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        Main Message (appears at top)
                      </p>

                      {/* Message Font Selection */}
                      <FormField
                        control={control}
                        name="messageFont"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Font Family</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      'w-full justify-between',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    {field.value
                                      ? SYSTEM_FONTS.find((font) => font.value === field.value)
                                          ?.label
                                      : 'Select font...'}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0">
                                <Command>
                                  <CommandInput placeholder="Search fonts..." />
                                  <CommandList>
                                    <CommandEmpty>No font found.</CommandEmpty>
                                    <CommandGroup>
                                      {SYSTEM_FONTS.map((font) => (
                                        <CommandItem
                                          value={font.label}
                                          key={font.value}
                                          onSelect={() => {
                                            setValue('messageFont', font.value);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              font.value === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          <span style={{ fontFamily: font.value }}>
                                            {font.label}
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Font Size */}
                      <FormField
                        control={control}
                        name="messageFontSize"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Font Size</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(1) ?? '2.5'}rem
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={2.5}
                                max={6}
                                step={0.1}
                                value={[field.value ?? 2.5]}
                                onValueChange={(values) => setValue('messageFontSize', values[0])}
                              />
                            </FormControl>
                            <FormDescription>Minimum 2.5rem for readability</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Contrast */}
                      <FormField
                        control={control}
                        name="messageContrast"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Opacity</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(0) ?? '100'}%
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value ?? 100]}
                                onValueChange={(values) => setValue('messageContrast', values[0])}
                              />
                            </FormControl>
                            <FormDescription>
                              Adjust text visibility (100% = fully visible)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Text Color */}
                      <FormField
                        control={control}
                        name="messageTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Color</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value || '#ffffff'}
                              </span>
                            </div>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) => setValue('messageTextColor', e.target.value)}
                                  className="h-10 w-14 cursor-pointer p-1"
                                />
                                <Input
                                  type="text"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) => setValue('messageTextColor', e.target.value)}
                                  placeholder="#ffffff"
                                  className="flex-1 font-mono"
                                  maxLength={7}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>Choose the text color for the message</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Text Shadow */}
                      <FormField
                        control={control}
                        name="messageTextShadow"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Text Shadow</FormLabel>
                              <FormDescription>
                                Add a shadow behind the text for better readability
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                name={field.name}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Message Text Shadow Darkness - only show when shadow is enabled */}
                      {form.watch('messageTextShadow') && (
                        <FormField
                          control={control}
                          name="messageTextShadowDarkness"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Shadow Darkness</FormLabel>
                                <span className="text-sm text-muted-foreground">
                                  {field.value?.toFixed(0) ?? '50'}%
                                </span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value ?? 50]}
                                  onValueChange={(values) =>
                                    setValue('messageTextShadowDarkness', values[0])
                                  }
                                />
                              </FormControl>
                              <FormDescription>
                                0% = light shadow, 100% = dark shadow
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <Separator />

                    {/* Secondary Message Font Settings */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        Secondary Message (appears at bottom)
                      </p>

                      {/* Secondary Message Font Selection */}
                      <FormField
                        control={control}
                        name="secondaryMessageFont"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Font Family</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      'w-full justify-between',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    {field.value
                                      ? SYSTEM_FONTS.find((font) => font.value === field.value)
                                          ?.label
                                      : 'Select font...'}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0">
                                <Command>
                                  <CommandInput placeholder="Search fonts..." />
                                  <CommandList>
                                    <CommandEmpty>No font found.</CommandEmpty>
                                    <CommandGroup>
                                      {SYSTEM_FONTS.map((font) => (
                                        <CommandItem
                                          value={font.label}
                                          key={font.value}
                                          onSelect={() => {
                                            setValue('secondaryMessageFont', font.value);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              font.value === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          <span style={{ fontFamily: font.value }}>
                                            {font.label}
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Font Size */}
                      <FormField
                        control={control}
                        name="secondaryMessageFontSize"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Font Size</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(1) ?? '2.0'}rem
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={2}
                                max={5}
                                step={0.1}
                                value={[field.value ?? 2]}
                                onValueChange={(values) =>
                                  setValue('secondaryMessageFontSize', values[0])
                                }
                              />
                            </FormControl>
                            <FormDescription>Minimum 2rem for readability</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Contrast */}
                      <FormField
                        control={control}
                        name="secondaryMessageContrast"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Opacity</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(0) ?? '95'}%
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value ?? 95]}
                                onValueChange={(values) =>
                                  setValue('secondaryMessageContrast', values[0])
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              Adjust text visibility (100% = fully visible)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Color */}
                      <FormField
                        control={control}
                        name="secondaryMessageTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Color</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value || '#ffffff'}
                              </span>
                            </div>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) =>
                                    setValue('secondaryMessageTextColor', e.target.value)
                                  }
                                  className="h-10 w-14 cursor-pointer p-1"
                                />
                                <Input
                                  type="text"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) =>
                                    setValue('secondaryMessageTextColor', e.target.value)
                                  }
                                  placeholder="#ffffff"
                                  className="flex-1 font-mono"
                                  maxLength={7}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Choose the text color for the secondary message
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Shadow */}
                      <FormField
                        control={control}
                        name="secondaryMessageTextShadow"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Text Shadow</FormLabel>
                              <FormDescription>
                                Add a shadow behind the text for better readability
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                name={field.name}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Shadow Darkness - only show when shadow is enabled */}
                      {form.watch('secondaryMessageTextShadow') && (
                        <FormField
                          control={control}
                          name="secondaryMessageTextShadowDarkness"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Shadow Darkness</FormLabel>
                                <span className="text-sm text-muted-foreground">
                                  {field.value?.toFixed(0) ?? '50'}%
                                </span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value ?? 50]}
                                  onValueChange={(values) =>
                                    setValue('secondaryMessageTextShadowDarkness', values[0])
                                  }
                                />
                              </FormControl>
                              <FormDescription>
                                0% = light shadow, 100% = dark shadow
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Link Settings */}
              <FormField
                control={control}
                name="linkUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link URL (Optional)</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://example.com/page" {...field} />
                    </FormControl>
                    <FormDescription>
                      If provided, the entire banner becomes clickable.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* Display Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Display Settings</h3>

                <FormField
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>Only active banners are displayed.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          name={field.name}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormItem className="flex flex-col">
                    <FormLabel>Display From</FormLabel>
                    <DatePicker fieldName="displayFrom" onSelect={handleDateSelect} />
                    <FormDescription>When the banner should start displaying.</FormDescription>
                    <FormMessage />
                  </FormItem>

                  <FormItem className="flex flex-col">
                    <FormLabel>Display Until</FormLabel>
                    <DatePicker fieldName="displayUntil" onSelect={handleDateSelect} />
                    <FormDescription>When the banner should stop displaying.</FormDescription>
                    <FormMessage />
                  </FormItem>
                </div>
              </div>

              <Separator />

              {/* Internal Notes */}
              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Notes for admins - not displayed publicly..."
                        className="min-h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Internal notes about this banner. Not visible to users.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Preview */}
              {(watchedImageUrl || watchedBackgroundColor) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Preview</h3>
                    <p className="text-sm text-muted-foreground">
                      Drag the text to position it on the image.
                    </p>
                    <div
                      ref={previewContainerRef}
                      className="relative w-full overflow-hidden rounded-lg border"
                      style={{
                        paddingBottom: `${100 / 1.618}%`,
                        cursor: isDraggingMessage || isDraggingSecondary ? 'grabbing' : 'default',
                      }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundColor: !watchedImageUrl ? watchedBackgroundColor : undefined,
                          backgroundImage: watchedImageUrl ? `url(${watchedImageUrl})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        {watchedIsOverlayed && (
                          <>
                            {/* Message - draggable and positioned */}
                            <span
                              className={cn(
                                'absolute cursor-grab select-none px-2 transition-shadow',
                                isDraggingMessage && 'cursor-grabbing',
                                'hover:ring-2 hover:ring-white/50 hover:ring-offset-2 hover:ring-offset-transparent'
                              )}
                              style={{
                                left: `${watchedMessagePositionX ?? 50}%`,
                                top: `${watchedMessagePositionY ?? 10}%`,
                                transform: `translate(-50%, -50%)`,
                                maxWidth: '90%',
                                textAlign: 'center',
                                fontFamily:
                                  watchedMessageFont === 'system-ui'
                                    ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                                    : `'${watchedMessageFont}', system-ui, sans-serif`,
                                fontSize: `${watchedMessageFontSize}rem`,
                                color: hexToRgba(
                                  watchedMessageTextColor || '#ffffff',
                                  (watchedMessageContrast ?? 100) / 100
                                ),
                                textShadow:
                                  watchedMessageTextShadow && watchedImageUrl
                                    ? `0 1px 2px rgba(0,0,0,${0.3 + ((watchedMessageTextShadowDarkness ?? 50) / 100) * 0.6})`
                                    : 'none',
                                textTransform: 'none',
                                letterSpacing: 'normal',
                                fontWeight: 'normal',
                              }}
                              onMouseDown={handleMessageDragStart}
                              onTouchStart={handleMessageDragStart}
                              onDoubleClick={() => {
                                messageTextareaRef.current?.focus();
                                messageTextareaRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                              }}
                              title="Drag to position, double-click to edit"
                            >
                              {watchedMessage || 'Your message here'}
                            </span>
                            {/* Secondary message - draggable and positioned */}
                            {watchedSecondaryMessage && (
                              <span
                                className={cn(
                                  'absolute cursor-grab select-none px-2 transition-shadow',
                                  isDraggingSecondary && 'cursor-grabbing',
                                  'hover:ring-2 hover:ring-white/50 hover:ring-offset-2 hover:ring-offset-transparent'
                                )}
                                style={{
                                  left: `${watchedSecondaryMessagePositionX ?? 50}%`,
                                  top: `${watchedSecondaryMessagePositionY ?? 90}%`,
                                  transform: `translate(-50%, -50%)`,
                                  maxWidth: '90%',
                                  textAlign: 'center',
                                  fontFamily:
                                    watchedSecondaryMessageFont === 'system-ui'
                                      ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                                      : `'${watchedSecondaryMessageFont}', system-ui, sans-serif`,
                                  fontSize: `${watchedSecondaryMessageFontSize}rem`,
                                  color: hexToRgba(
                                    watchedSecondaryMessageTextColor || '#ffffff',
                                    (watchedSecondaryMessageContrast ?? 95) / 100
                                  ),
                                  textShadow:
                                    watchedSecondaryMessageTextShadow && watchedImageUrl
                                      ? `0 1px 2px rgba(0,0,0,${0.3 + ((watchedSecondaryMessageTextShadowDarkness ?? 50) / 100) * 0.6})`
                                      : 'none',
                                  textTransform: 'none',
                                  letterSpacing: 'normal',
                                  fontWeight: 'normal',
                                }}
                                onMouseDown={handleSecondaryDragStart}
                                onTouchStart={handleSecondaryDragStart}
                                onDoubleClick={() => {
                                  secondaryMessageTextareaRef.current?.focus();
                                  secondaryMessageTextareaRef.current?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                  });
                                }}
                                title="Drag to position, double-click to edit"
                              >
                                {watchedSecondaryMessage}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Position display */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>
                        Message: X={watchedMessagePositionX ?? 50}%, Y=
                        {watchedMessagePositionY ?? 10}%
                      </span>
                      {watchedSecondaryMessage && (
                        <span>
                          Secondary: X={watchedSecondaryMessagePositionX ?? 50}%, Y=
                          {watchedSecondaryMessagePositionY ?? 90}%
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Saving...'
                  : isEditMode
                    ? 'Save Changes'
                    : 'Create Notification Banner'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>

      {/* Image Cropper Dialog */}
      <ImageCropper
        imageSrc={imageToCrop}
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        onCropComplete={handleCropComplete}
        initialBackgroundColor={watchedBackgroundColor}
      />
    </div>
  );
}
