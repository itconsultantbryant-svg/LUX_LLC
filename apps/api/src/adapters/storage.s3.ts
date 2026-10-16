import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorageAdapter, StoredObject } from './types.js';

const MAX_BYTES = 512 * 1024;
/** Private Neon/S3 storage. Downloads always pass through the authorized API. */
export class S3ObjectStorageAdapter implements ObjectStorageAdapter {
  readonly id = 'storage.s3';
  readonly mode = 'live' as const;
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}
  private validateKey(key: string) {
    if (!/^private\/[a-f0-9-]{36}$/.test(key) && !/^demo\/[a-zA-Z0-9-]+\.txt$/.test(key))
      throw new Error('Invalid storage key');
  }
  async putObject(input: {
    key: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    this.validateKey(input.key);
    if (input.bytes.length > MAX_BYTES) throw new Error('Document exceeds the storage limit');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: 'application/octet-stream',
        ContentLength: input.bytes.length,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    return { key: input.key, contentType: input.contentType, byteSize: input.bytes.length };
  }
  async readObject(key: string): Promise<Buffer> {
    this.validateKey(key);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    if (!(response.Body instanceof Readable)) throw new Error('Document storage returned no body');
    const body = response.Body;
    if (response.ContentLength && response.ContentLength > MAX_BYTES) {
      body.destroy();
      throw new Error('Document exceeds the storage limit');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BYTES) {
        body.destroy();
        throw new Error('Document exceeds the storage limit');
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  async getSignedReadUrl(): Promise<string> {
    throw new Error('Direct document URLs are disabled; use the authorized download API');
  }
  async deleteObject(key: string): Promise<void> {
    this.validateKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15000),
    });
  }
}
