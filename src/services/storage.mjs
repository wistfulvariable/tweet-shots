/**
 * Cloud Storage service for URL-response mode.
 * Uploads rendered images to GCS and returns public URLs.
 */

import { Storage } from '@google-cloud/storage';

let _storage = null;

function getStorage() {
  if (!_storage) {
    _storage = new Storage();
  }
  return _storage;
}

/**
 * Upload a buffer to Cloud Storage and return a public URL.
 * @param {string} bucketName - GCS bucket name
 * @param {string} filename - Destination filename
 * @param {Buffer} data - File content
 * @param {string} contentType - MIME type (e.g. 'image/png')
 * @returns {Promise<string>} Public URL
 */
export async function upload(bucketName, filename, data, contentType) {
  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(filename);

  await file.save(data, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });

  return `https://storage.googleapis.com/${bucketName}/${filename}`;
}
