import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID, createHash } from "node:crypto";
import net from "node:net";
import { z } from "zod";
import { pool, transaction, one } from "../../../packages/db/index.ts";
import { DomainError } from "../../../packages/domain/index.ts";
import {
  claimAccess,
  requirePermission,
  event,
  audit,
  type Context,
} from "./access.ts";
function storage() {
  if (
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY
  )
    throw new DomainError("PRIVATE_STORAGE_NOT_CONFIGURED", 503);
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}
export async function upload(ctx: Context, claimId: string, input: unknown) {
  requirePermission(ctx, "claims");
  const d = z
    .object({
      documentType: z.string().min(2).max(80),
      contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      size: z.number().int().min(1).max(10485760),
    })
    .parse(input);
  return transaction(async (db) => {
    const c = await claimAccess(db, ctx, claimId, true);
    if (c.facility_id !== ctx.orgId || c.state !== "DRAFT")
      throw new DomainError("DRAFT_REQUIRED");
    const key = "quarantine/" + randomUUID();
    const url = await getSignedUrl(
      storage(),
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: d.contentType,
      }),
      { expiresIn: 120 },
    );
    const a = await one(
      db,
      "INSERT INTO attachments(claim_id,object_key,document_type,content_type,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,scan_state",
      [claimId, key, d.documentType, d.contentType, d.size, ctx.userId],
    );
    await audit(db, ctx, "AttachmentUploadPrepared", a.id);
    return { ...a, url };
  });
}
export async function completeUpload(ctx: Context, id: string) {
  requirePermission(ctx, "claims");
  return transaction(async (db) => {
    const a = await one(db, "SELECT * FROM attachments WHERE id::text=$1", [
      id,
    ]);
    if (!a) throw new DomainError("RECORD_NOT_FOUND", 404);
    const c = await claimAccess(db, ctx, a.claim_id, true);
    if (c.facility_id !== ctx.orgId || c.state !== "DRAFT")
      throw new DomainError("DRAFT_REQUIRED");
    await event(db, ctx, "AttachmentUploaded", id);
    return { id, scan_state: "QUARANTINED" };
  });
}
export async function download(ctx: Context, id: string) {
  requirePermission(ctx, "clinical");
  const a = await one(pool, "SELECT * FROM attachments WHERE id::text=$1", [
    id,
  ]);
  if (!a) throw new DomainError("RECORD_NOT_FOUND", 404);
  await claimAccess(pool, ctx, a.claim_id);
  if (a.scan_state !== "CLEAN")
    throw new DomainError("ATTACHMENT_NOT_CLEARED", 423);
  await audit(pool, ctx, "AttachmentDownloaded", id);
  return {
    url: await getSignedUrl(
      storage(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: a.object_key,
        ResponseContentDisposition: 'attachment; filename="document"',
      }),
      { expiresIn: 60 },
    ),
  };
}
async function clamav(bytes: Buffer) {
  if (!process.env.CLAMAV_HOST) throw Error("SCANNER_NOT_CONFIGURED");
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(
      Number(process.env.CLAMAV_PORT || 3310),
      process.env.CLAMAV_HOST!,
    );
    let response = "";
    socket.setTimeout(30000, () => socket.destroy(Error("SCAN_TIMEOUT")));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 65536) {
        const chunk = bytes.subarray(i, i + 65536);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (d) => (response += d.toString()));
    socket.on("end", () =>
      response.includes("stream: OK")
        ? resolve()
        : reject(Error("MALWARE_OR_SCAN_FAILURE")),
    );
    socket.on("error", reject);
  });
}
export async function scanAttachment(id: string) {
  const a = await one(pool, "SELECT * FROM attachments WHERE id=$1", [id]);
  if (!a || a.scan_state === "CLEAN" || a.scan_state === "REJECTED") return;
  try {
    const result = await storage().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: a.object_key,
      }),
    );
    if (
      !result.ContentLength ||
      result.ContentLength > 10485760 ||
      result.ContentLength !== a.size_bytes
    )
      throw Error("INVALID_SIZE");
    const bytes = Buffer.from(await result.Body!.transformToByteArray());
    const valid =
      a.content_type === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : a.content_type === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) {
      await pool.query(
        `UPDATE attachments SET scan_state='REJECTED' WHERE id=$1`,
        [id],
      );
      return;
    }
    await clamav(bytes);
    // Publish the exact scanned bytes under a new server-only key. A still-valid
    // quarantine PUT URL cannot overwrite content which is later downloaded.
    const cleanKey = "clean/" + randomUUID();
    await storage().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: cleanKey,
        Body: bytes,
        ContentType: a.content_type,
      }),
    );
    await pool.query(
      `UPDATE attachments SET scan_state='CLEAN',sha256=$2,object_key=$3 WHERE id=$1 AND scan_state<>'CLEAN'`,
      [id, createHash("sha256").update(bytes).digest("hex"), cleanKey],
    );
  } catch (e) {
    await pool.query(
      `UPDATE attachments SET scan_state='SCAN_ERROR' WHERE id=$1 AND scan_state<>'CLEAN'`,
      [id],
    );
    throw e;
  }
}
