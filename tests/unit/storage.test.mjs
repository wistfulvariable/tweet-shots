/**
 * Unit tests for storage service (src/services/storage.mjs).
 * Tests Cloud Storage upload and URL generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock GCS ────────────────────────────────────────────────────────────────

const mockSave = vi.fn(async () => {});
const mockFile = vi.fn(() => ({ save: mockSave }));
const mockBucket = vi.fn(() => ({ file: mockFile }));

vi.mock('@google-cloud/storage', () => ({
  Storage: class MockStorage {
    bucket(...args) { return mockBucket(...args); }
  },
}));

const { upload } = await import('../../src/services/storage.mjs');

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('upload', () => {
  it('saves buffer to correct bucket and filename', async () => {
    const data = Buffer.from('fake-image-data');

    await upload('test-bucket', 'screenshots/123.png', data, 'image/png');

    expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    expect(mockFile).toHaveBeenCalledWith('screenshots/123.png');
    expect(mockSave).toHaveBeenCalledWith(data, {
      contentType: 'image/png',
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
  });

  it('returns correct public URL format', async () => {
    const url = await upload('my-bucket', 'path/to/file.png', Buffer.from('data'), 'image/png');

    expect(url).toBe('https://storage.googleapis.com/my-bucket/path/to/file.png');
  });

  it('passes correct content type for SVG', async () => {
    await upload('bucket', 'img.svg', Buffer.from('<svg/>'), 'image/svg+xml');

    expect(mockSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contentType: 'image/svg+xml' })
    );
  });

  it('sets 1-year cache control header', async () => {
    await upload('bucket', 'file.png', Buffer.from('data'), 'image/png');

    expect(mockSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: { cacheControl: 'public, max-age=31536000' },
      })
    );
  });

  it('propagates GCS save errors', async () => {
    mockSave.mockRejectedValueOnce(new Error('GCS upload failed'));

    await expect(
      upload('bucket', 'file.png', Buffer.from('data'), 'image/png')
    ).rejects.toThrow('GCS upload failed');
  });
});
