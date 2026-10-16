import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { expect, it, vi } from 'vitest';
import { S3ObjectStorageAdapter } from './storage.s3.js';
const key = 'private/12345678-1234-1234-1234-123456789abc';
function setup() {
  const client = new S3Client({ region: 'us-east-1' });
  const send = vi.spyOn(client, 'send');
  return { adapter: new S3ObjectStorageAdapter(client, 'private-documents'), send };
}
it('streams private documents without issuing direct URLs or public ACLs', async () => {
  const { adapter, send } = setup();
  send.mockResolvedValueOnce({} as never);
  await adapter.putObject({ key, bytes: Buffer.from('synthetic'), contentType: 'text/plain' });
  expect(send.mock.calls[0][0].input).toMatchObject({
    Bucket: 'private-documents',
    Key: key,
    CacheControl: 'private, no-store',
  });
  expect(send.mock.calls[0][0].input).not.toHaveProperty('ACL');
  send.mockResolvedValueOnce({
    Body: Readable.from([Buffer.from('synthetic')]),
    ContentLength: 9,
  } as never);
  expect((await adapter.readObject(key)).toString()).toBe('synthetic');
  await expect(adapter.getSignedReadUrl()).rejects.toThrow('Direct document URLs are disabled');
});
it('rejects path traversal and oversized objects before upload', async () => {
  const { adapter, send } = setup();
  await expect(adapter.readObject('../secret')).rejects.toThrow('Invalid storage key');
  await expect(
    adapter.putObject({ key, bytes: Buffer.alloc(512 * 1024 + 1), contentType: 'text/plain' }),
  ).rejects.toThrow('storage limit');
  expect(send).not.toHaveBeenCalled();
});
it('bounds streamed reads even when content length is missing', async () => {
  const { adapter, send } = setup();
  const body = Readable.from([Buffer.alloc(512 * 1024), Buffer.from('x')]);
  send.mockResolvedValueOnce({ Body: body } as never);
  await expect(adapter.readObject(key)).rejects.toThrow('storage limit');
  expect(body.destroyed).toBe(true);
});
