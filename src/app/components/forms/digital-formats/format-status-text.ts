/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UploadState } from '@/types/digital-format';

export const getStatusText = (state: UploadState, uploaded: boolean): string => {
  switch (state.status) {
    case 'validating':
      /* v8 ignore next -- state is synchronously overwritten by 'uploading' before render */
      return 'Validating file...';
    case 'uploading': {
      const { currentFile, totalFiles } = state;
      if (totalFiles > 1) {
        return `Uploading file ${currentFile} of ${totalFiles}...`;
      }
      return 'Uploading to cloud storage...';
    }
    case 'confirming':
      return 'Finalizing upload...';
    case 'success':
      return 'Upload successful!';
    case 'error':
      return state.message;
    default:
      return uploaded ? 'Uploaded' : 'No file uploaded';
  }
};
