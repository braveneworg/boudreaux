import { z } from 'zod';

/**
 * System fonts available for notification banner text
 * These are widely supported across different operating systems
 */
export const SYSTEM_FONTS = [
  { value: 'system-ui', label: 'System Default' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Arial Black', label: 'Arial Black' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Palatino', label: 'Palatino' },
  { value: 'Garamond', label: 'Garamond' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Lucida Console', label: 'Lucida Console' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Anton', label: 'Anton' },
  { value: 'Fjalla One', label: 'Fjalla One' },
  { value: 'Archivo Black', label: 'Archivo Black' },
] as const;

export type SystemFont = (typeof SYSTEM_FONTS)[number]['value'];

export const notificationBannerSchema = z
  .object({
    message: z
      .string()
      .min(1, { message: 'Message is required' })
      .max(500, { message: 'Message must be less than 500 characters' }),
    secondaryMessage: z
      .string()
      .max(200, { message: 'Secondary message must be less than 200 characters' })
      .optional()
      .or(z.literal('')),
    notes: z
      .string()
      .max(1000, { message: 'Notes must be less than 1000 characters' })
      .optional()
      .or(z.literal('')),
    originalImageUrl: z
      .string()
      .url({ message: 'Original image URL must be a valid URL' })
      .optional()
      .or(z.literal('')),
    imageUrl: z
      .string()
      .url({ message: 'Image URL must be a valid URL' })
      .optional()
      .or(z.literal('')),
    linkUrl: z
      .string()
      .url({ message: 'Link URL must be a valid URL' })
      .optional()
      .or(z.literal('')),
    backgroundColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
        message: 'Background color must be a valid hex color (e.g., #ffffff)',
      })
      .optional()
      .or(z.literal('')),
    isOverlayed: z.boolean().default(true),
    isActive: z.boolean().default(true),
    displayFrom: z.string().optional().or(z.literal('')),
    displayUntil: z.string().optional().or(z.literal('')),
    // Font styling for main message
    messageFont: z.string().default('system-ui'),
    messageFontSize: z
      .number()
      .min(0.5, { message: 'Message font size must be at least 0.5rem' })
      .max(10, { message: 'Message font size must be at most 10rem' })
      .default(2.5),
    messageContrast: z
      .number()
      .min(0, { message: 'Contrast must be at least 0%' })
      .max(100, { message: 'Contrast must be at most 100%' })
      .default(100),
    // Font styling for secondary message
    secondaryMessageFont: z.string().default('system-ui'),
    secondaryMessageFontSize: z
      .number()
      .min(0.5, { message: 'Secondary message font size must be at least 0.5rem' })
      .max(10, { message: 'Secondary message font size must be at most 10rem' })
      .default(2),
    secondaryMessageContrast: z
      .number()
      .min(0, { message: 'Contrast must be at least 0%' })
      .max(100, { message: 'Contrast must be at most 100%' })
      .default(95),
    // Text color settings
    messageTextColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
        message: 'Message text color must be a valid hex color (e.g., #ffffff)',
      })
      .default('#ffffff'),
    secondaryMessageTextColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
        message: 'Secondary message text color must be a valid hex color (e.g., #ffffff)',
      })
      .default('#ffffff'),
    // Text shadow settings
    messageTextShadow: z.boolean().default(true),
    messageTextShadowDarkness: z
      .number()
      .min(0, { message: 'Shadow darkness must be at least 0%' })
      .max(100, { message: 'Shadow darkness must be at most 100%' })
      .default(50),
    secondaryMessageTextShadow: z.boolean().default(true),
    secondaryMessageTextShadowDarkness: z
      .number()
      .min(0, { message: 'Shadow darkness must be at least 0%' })
      .max(100, { message: 'Shadow darkness must be at most 100%' })
      .default(50),
    // Text position settings (percentage 0-100)
    messagePositionX: z
      .number()
      .min(0, { message: 'Position X must be at least 0%' })
      .max(100, { message: 'Position X must be at most 100%' })
      .default(50),
    messagePositionY: z
      .number()
      .min(0, { message: 'Position Y must be at least 0%' })
      .max(100, { message: 'Position Y must be at most 100%' })
      .default(10),
    secondaryMessagePositionX: z
      .number()
      .min(0, { message: 'Position X must be at least 0%' })
      .max(100, { message: 'Position X must be at most 100%' })
      .default(50),
    secondaryMessagePositionY: z
      .number()
      .min(0, { message: 'Position Y must be at least 0%' })
      .max(100, { message: 'Position Y must be at most 100%' })
      .default(90),
    // Text rotation settings (degrees)
    messageRotation: z
      .number()
      .min(-360, { message: 'Rotation must be at least -360°' })
      .max(360, { message: 'Rotation must be at most 360°' })
      .default(0),
    secondaryMessageRotation: z
      .number()
      .min(-360, { message: 'Rotation must be at least -360°' })
      .max(360, { message: 'Rotation must be at most 360°' })
      .default(0),
    // Image offset settings (percentage -100 to 100)
    imageOffsetX: z
      .number()
      .min(-100, { message: 'Offset X must be at least -100%' })
      .max(100, { message: 'Offset X must be at most 100%' })
      .default(0),
    imageOffsetY: z
      .number()
      .min(-100, { message: 'Offset Y must be at least -100%' })
      .max(100, { message: 'Offset Y must be at most 100%' })
      .default(0),
    // Text box dimensions (percentage of container)
    messageWidth: z
      .number()
      .min(10, { message: 'Width must be at least 10%' })
      .max(100, { message: 'Width must be at most 100%' })
      .default(80),
    messageHeight: z
      .number()
      .min(5, { message: 'Height must be at least 5%' })
      .max(100, { message: 'Height must be at most 100%' })
      .default(30),
    secondaryMessageWidth: z
      .number()
      .min(10, { message: 'Width must be at least 10%' })
      .max(100, { message: 'Width must be at most 100%' })
      .default(80),
    secondaryMessageHeight: z
      .number()
      .min(5, { message: 'Height must be at least 5%' })
      .max(100, { message: 'Height must be at most 100%' })
      .default(30),
  })
  .refine(
    (data) => {
      // Either imageUrl, originalImageUrl, or backgroundColor should be provided
      const hasImage = data.imageUrl && data.imageUrl.length > 0;
      const hasOriginalImage = data.originalImageUrl && data.originalImageUrl.length > 0;
      const hasBackgroundColor = data.backgroundColor && data.backgroundColor.length > 0;
      return hasImage || hasOriginalImage || hasBackgroundColor;
    },
    {
      message: 'Either an image URL or a background color is required',
      path: ['imageUrl'],
    }
  );

export type NotificationBannerFormData = z.input<typeof notificationBannerSchema>;
export type NotificationBannerOutput = z.output<typeof notificationBannerSchema>;
