import type { DigitalFormatType } from '@/types/digital-format';

export interface FormatConfig {
  type: DigitalFormatType;
  label: string;
  description: string;
  acceptTypes: string;
  mimeTypes: string[];
}

export const FORMAT_CONFIGS: FormatConfig[] = [
  {
    type: 'MP3_320KBPS',
    label: 'MP3 320kbps',
    description: 'High quality compressed audio (recommended for most users)',
    acceptTypes: '.mp3,audio/mpeg',
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
  },
  {
    type: 'MP3_V0',
    label: 'MP3 V0',
    description: 'Variable bitrate MP3 (excellent quality, efficient file size)',
    acceptTypes: '.mp3,audio/mpeg',
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
  },
  {
    type: 'AAC',
    label: 'AAC',
    description: 'Advanced audio coding (efficient compression, good quality)',
    acceptTypes: '.aac,.m4a,audio/aac,audio/x-aac,audio/mp4,audio/x-m4a',
    mimeTypes: ['audio/aac', 'audio/x-aac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  },
  {
    type: 'OGG_VORBIS',
    label: 'Ogg Vorbis',
    description: 'Open-source lossy compression (high quality, royalty-free)',
    acceptTypes: '.ogg,audio/ogg,audio/vorbis,application/ogg',
    mimeTypes: ['audio/ogg', 'audio/vorbis', 'application/ogg'],
  },
  {
    type: 'FLAC',
    label: 'FLAC',
    description: 'Lossless audio compression (highest quality, larger file size)',
    acceptTypes: '.flac,audio/flac,audio/x-flac',
    mimeTypes: ['audio/flac', 'audio/x-flac'],
  },
  {
    type: 'ALAC',
    label: 'ALAC',
    description: 'Apple lossless compression (highest quality, Apple ecosystem)',
    acceptTypes: '.m4a,audio/x-m4a,audio/m4a,audio/mp4',
    mimeTypes: ['audio/x-m4a', 'audio/m4a', 'audio/mp4'],
  },
  {
    type: 'WAV',
    label: 'WAV',
    description: 'Uncompressed audio (studio quality, very large files)',
    acceptTypes: '.wav,audio/wav,audio/x-wav,audio/wave',
    mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  },
  {
    type: 'AIFF',
    label: 'AIFF',
    description: 'Uncompressed audio (studio quality, Apple ecosystem)',
    acceptTypes: '.aiff,.aif,audio/aiff,audio/x-aiff',
    mimeTypes: ['audio/aiff', 'audio/x-aiff'],
  },
];
