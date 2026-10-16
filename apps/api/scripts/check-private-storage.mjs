// Synthetic object round trip. Uses the configured private bucket; prints no credentials.
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
config({ path: new URL('../.env', import.meta.url), quiet: true });
const e = process.env;
const client = new S3Client({
  endpoint: e.S3_ENDPOINT,
  region: e.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  maxAttempts: 2,
});
const Key = `private/${randomUUID()}`;
const Bucket = e.S3_BUCKET;
const Body = Buffer.from('Synthetic private storage verification');
let uploaded = false;
try {
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body,
      ContentType: 'application/octet-stream',
      CacheControl: 'private, no-store',
    }),
  );
  uploaded = true;
  const response = await client.send(new GetObjectCommand({ Bucket, Key }));
  if (!Buffer.from(await response.Body.transformToByteArray()).equals(Body))
    throw new Error('Round-trip mismatch');
  const anonymous = await fetch(`${e.S3_ENDPOINT}/${Bucket}/${Key}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (![401, 403, 404].includes(anonymous.status))
    throw new Error('Anonymous storage access was not denied');
  console.log('PASS: durable object round trip and anonymous access denial.');
} finally {
  if (uploaded) await client.send(new DeleteObjectCommand({ Bucket, Key }));
  client.destroy();
}
