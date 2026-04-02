# API Contract: Bundle Download

**Endpoint**: `GET /api/releases/[id]/download/bundle`
**Status**: Existing (from 004-release-digital-formats) — no changes
needed for 005.

## Request

### URL Parameters

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `id`      | string | Yes      | Release ID (MongoDB ObjectId) |

### Query Parameters

| Parameter | Type   | Required | Description                                            |
| --------- | ------ | -------- | ------------------------------------------------------ |
| `formats` | string | Yes      | Comma-separated format types (e.g., `FLAC,WAV,MP3_V0`) |

### Authentication

JWT token via `next-auth` (cookie-based). Returns 401 if not
authenticated.

## Response

### Success (200)

Binary ZIP stream with `Content-Type: application/zip`.

```
Content-Type: application/zip
Content-Disposition: attachment; filename="Release Title.zip"
Cache-Control: no-store
```

ZIP structure:

```
Release Title.zip
├── FLAC/
│   ├── 01 - Track One.flac
│   └── 02 - Track Two.flac
├── MP3 V0/
│   ├── 01 - Track One.mp3
│   └── 02 - Track Two.mp3
└── WAV/
    ├── 01 - Track One.wav
    └── 02 - Track Two.wav
```

Directory names use `FORMAT_LABELS` mapping (e.g., `FLAC` → `"FLAC"`,
`MP3_V0` → `"MP3 V0"`, `WAV` → `"WAV"`).

### Error Responses

| Status | Error Code          | Description                                |
| ------ | ------------------- | ------------------------------------------ |
| 400    | `INVALID_FORMATS`   | Formats parameter missing or invalid       |
| 401    | `UNAUTHORIZED`      | Not authenticated                          |
| 403    | `PURCHASE_REQUIRED` | No purchase record found                   |
| 403    | `DOWNLOAD_LIMIT`    | 5-download cap reached                     |
| 404    | `NOT_FOUND`         | Release not found or unpublished           |
| 404    | `NO_FILES`          | No downloadable files for selected formats |
| 500    | `INTERNAL_ERROR`    | Unexpected server error                    |

## Side Effects

1. `ReleaseDownload.downloadCount` incremented by 1 (bundle = 1 download)
2. `DownloadEvent` logged per format in the ZIP (N events for N formats)

## Validation Schema

```typescript
// bundleDownloadQuerySchema (existing)
z.object({
  formats: z
    .string()
    .min(1)
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum([...DIGITAL_FORMAT_TYPES])).min(1)),
});
```

## Notes

- `maxDuration = 300` (5 minutes) for large multi-format bundles
- ZIP uses `zlib.level = 0` (store mode) since audio files are already
  compressed
- S3 objects are streamed directly into archiver — no buffering to disk
