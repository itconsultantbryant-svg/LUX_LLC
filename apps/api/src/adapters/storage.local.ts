import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStorageAdapter, StoredObject } from './types.js';

/**
 * Local private-ish object storage for development.
 * Replacement point: S3-compatible private bucket via STORAGE_ADAPTER=s3.
 */
export class LocalObjectStorageAdapter implements ObjectStorageAdapter {
  readonly id = 'storage.local';
  readonly mode = 'sandbox' as const;

  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    if (!/^private\/[a-f0-9-]{36}$/.test(key) && !/^demo\/[a-zA-Z0-9-]+\.txt$/.test(key))
      throw new Error('Invalid storage key');
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return resolved;
  }
  async readObject(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }
  async putObject(input: {
    key: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    const fullPath = this.resolveKey(input.key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.bytes);
    return {
      key: input.key,
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
    };
  }

  async getSignedReadUrl(key: string, expiresSeconds: number): Promise<string> {
    // Authenticated streaming will replace this; local path is not a public URL.
    return `local://authenticated/${encodeURIComponent(key)}?expires=${expiresSeconds}`;
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}
